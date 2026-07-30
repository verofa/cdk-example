import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";

export class EcsAlbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const vpc = new ec2.Vpc(this, "PocVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });
    const cluster = new ecs.Cluster(this, "PocCluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    // example resource
    // const queue = new sqs.Queue(this, 'CdkExampleQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
