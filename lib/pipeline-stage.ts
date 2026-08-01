import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { EcsAlbStack } from "./ecs-alb-stack";
import { EnvironmentConfig } from "./config";
import { config } from "process";
import { RdsSecretsStack } from "./rds-secrets-stack";
import { ConnectivityStack } from "./connectivity-stack";

export interface AppStageProps extends cdk.StageProps {
  config: EnvironmentConfig;
}

export class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const ecsStack = new EcsAlbStack(this, "EcsAlbStack", {
      config: props.config,
    });

    const rdsStack = new RdsSecretsStack(this, "RdsSecretsStack", {
      config: props.config,
    });

    new ConnectivityStack(this, "ConnectivityStack", {
      config: props.config,
      vpc: rdsStack.vpc,
      dbSecurityGroup: rdsStack.dbSecurityGroup,
      appVpc: ecsStack.vpc,
      appCluster: ecsStack.cluster,
    });
  }
}
