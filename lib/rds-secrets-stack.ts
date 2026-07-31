import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { EnvironmentConfig } from "./config";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

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

    const credentials = rds.Credentials.fromGeneratedSecret("dbadmin", {
      secretName: `${config.envName}/rds/dbadmin`,
    });

    const dbInstance = new rds.DatabaseInstance(this, "PocDatabase", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_8,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials,
      allocatedStorage: 20,
      storageEncrypted: true,
      multiAz: config.dbMultiAz,
      removalPolicy: config.dbRemovalPolicy,
      deletionProtection: config.dbDeletionProtection,
      backupRetention: cdk.Duration.days(config.dbBackupRetentionDays),
    });

    new ssm.StringParameter(this, "DbEndpointParam", {
      parameterName: `/${config.envName}/rds/endpoint`,
      stringValue: dbInstance.dbInstanceEndpointAddress,
      description: "RDS endpoint address -- not a secret, just app config",
    });

    const thirdPartyApiKey = new secretsmanager.Secret(
      this,
      "ThirdPartyApiKey",
      {
        secretName: `${config.envName}/app/third-party-api-key`,
        description: "Placeholder for a static third-party credential",
      },
    );

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: dbInstance.secret!.secretArn,
      description: "Secrets Manager ARN holding the generated DB credentials",
    });
    new cdk.CfnOutput(this, "DbEndpoint", {
      value: dbInstance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "ThirdPartyApiKeySecretArn", {
      value: thirdPartyApiKey.secretArn,
    });

    cdk.Tags.of(this).add("Environment", config.envName);
  }
}
