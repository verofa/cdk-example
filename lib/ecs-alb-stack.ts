import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

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
    const taskDefinition = new ecs.FargateTaskDefinition(this, "PocTaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/nginx/nginx:latest",
      ),
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "poc-app" }),
      portMappings: [{ containerPort: 80 }],
    });
    const service = new ecs.FargateService(this, "PocService", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, "PocAlb", {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener("PocListener", {
      port: 80,
      open: true,
    });

    listener.addTargets("PocTargets", {
      port: 80,
      targets: [service],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });
    // example resource
    // const queue = new sqs.Queue(this, 'CdkExampleQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
