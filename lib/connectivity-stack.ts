import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { EnvironmentConfig } from "./config";

export interface ConnectivityStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  dbSecurityGroup: ec2.ISecurityGroup;
}

export class ConnectivityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ConnectivityStackProps) {
    super(scope, id, props);
    const { config, vpc, dbSecurityGroup } = props;

    cdk.Tags.of(this).add("Environment", config.envName);
  }
}
