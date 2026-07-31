import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { EnvironmentConfig } from "./config";

export interface RdsSecretsStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class RdsSecretsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsSecretsStackProps) {
    super(scope, id, props);
    const { config } = props;

    const vpc = new ec2.Vpc(this, "PocDbVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    cdk.Tags.of(this).add("Environment", config.envName);
  }
}
