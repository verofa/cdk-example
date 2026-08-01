import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { EnvironmentConfig } from "./config";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";

export interface ConnectivityStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  dbSecurityGroup: ec2.ISecurityGroup;
  appVpc: ec2.IVpc;
  appCluster: ecs.ICluster;
}

export class ConnectivityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ConnectivityStackProps) {
    super(scope, id, props);
    const { config, vpc, dbSecurityGroup } = props;

    const localVpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
      vpcId: vpc.vpcId,
      vpcCidrBlock: vpc.vpcCidrBlock,
      availabilityZones: vpc.availabilityZones,
      isolatedSubnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
    });

    cdk.Tags.of(this).add("Environment", config.envName);

    // The VPC has no NAT gateway, so an instance here can't reach the
    // internet -- and Session Manager needs to reach AWS's SSM service.
    // These three interface endpoints (PrivateLink) give it a path there
    // without any internet access at all.
    localVpc.addInterfaceEndpoint("SsmEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    localVpc.addInterfaceEndpoint("SsmMessagesEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });
    localVpc.addInterfaceEndpoint("Ec2MessagesEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });

    const ssmInstance = new ec2.Instance(this, "SsmSessionInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      ssmSessionPermissions: true, // attaches the AmazonSSMManagedInstanceCore policy
    });

    // No inbound rule on the instance itself
    // Session Manager works by the agent connecting *outbound* to AWS.
    //

    const importedDbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "ImportedDbSecurityGroup",
      dbSecurityGroup.securityGroupId,
      { mutable: true },
    );

    importedDbSecurityGroup.addIngressRule(
      ssmInstance.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      "Allow SSM session-manager instance to reach Postgres",
    );

    new cdk.CfnOutput(this, "SsmInstanceId", {
      value: ssmInstance.instanceId,
      description:
        "Target for: aws ssm start-session --target <id> --document-name AWS-StartPortForwardingToRemoteHost",
    });

    const { appVpc, appCluster } = props; // add to the existing destructure line

    //VPC Peering: give VPC A and VPC B a network path to each other
    const peeringConnection = new ec2.CfnVPCPeeringConnection(
      this,
      "AppToDbPeering",
      {
        vpcId: appVpc.vpcId,
        peerVpcId: vpc.vpcId,
      },
    );

    // Peering alone doesn't route anything, both sides need an explicit
    // route added to their route tables, or traffic still has nowhere to go.

    // VPC A's app subnets -> VPC B, via the peering connection
    appVpc.privateSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `AppToDbRoute${index}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: vpc.vpcCidrBlock,
        vpcPeeringConnectionId: peeringConnection.ref,
      });
    });

    // VPC B's isolated subnets -> VPC A, via the same connection (the return path)
    vpc.isolatedSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `DbToAppRoute${index}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: appVpc.vpcCidrBlock,
        vpcPeeringConnectionId: peeringConnection.ref,
      });
    });
  }
}
