import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { EnvironmentConfig } from "./config";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface ConnectivityStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  dbSecurityGroup: ec2.ISecurityGroup;
  dbEndpoint: string;
  dbSecret: secretsmanager.ISecret;
  appVpc: ec2.IVpc;
  appCluster: ecs.ICluster;
}

export class ConnectivityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ConnectivityStackProps) {
    super(scope, id, props);
    const {
      config,
      vpc,
      dbSecurityGroup,
      dbEndpoint,
      dbSecret,
      appVpc,
      appCluster,
    } = props;

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

    const testTaskSecurityGroup = new ec2.SecurityGroup(
      this,
      "ConnectivityTestTaskSg",
      {
        vpc: appVpc,
        description:
          "One-off ECS task proving VPC A can reach the database in VPC B",
        allowAllOutbound: true,
      },
    );

    const testTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ConnectivityTestTaskDef",
      {
        cpu: 256,
        memoryLimitMiB: 512,
      },
    );

    testTaskDefinition.addContainer("ConnectivityTestContainer", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/docker/library/postgres:16-alpine",
      ),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "connectivity-test" }),
      entryPoint: ["sh", "-c"],
      command: [
        'psql -c "SELECT version();" -c "SELECT current_database();" && echo CONNECTIVITY_TEST_PASSED',
      ],
      environment: {
        PGHOST: dbEndpoint,
        PGPORT: "5432",
        PGDATABASE: "postgres",
      },
      secrets: {
        PGUSER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        PGPASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      },
    });

    // Reuses the same importedDbSecurityGroup reference from the SSM section
    // above -- a second ingress rule on it, this time for the app's task.
    importedDbSecurityGroup.addIngressRule(
      testTaskSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow VPC A connectivity-test task to reach Postgres",
    );

    new cdk.CfnOutput(this, "ConnectivityTestClusterName", {
      value: appCluster.clusterName,
    });
    new cdk.CfnOutput(this, "ConnectivityTestTaskDefArn", {
      value: testTaskDefinition.taskDefinitionArn,
    });
    new cdk.CfnOutput(this, "ConnectivityTestSecurityGroupId", {
      value: testTaskSecurityGroup.securityGroupId,
    });
    new cdk.CfnOutput(this, "ConnectivityTestSubnetIds", {
      value: cdk.Fn.join(
        ",",
        appVpc.privateSubnets.map((s) => s.subnetId),
      ),
    });
  }
}
