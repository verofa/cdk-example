import * as cdk from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { RdsSecretsStack } from "../lib/rds-secrets-stack";
import { devConfig, prodConfig } from "../lib/config";

describe("RdsSecretsStack", () => {
  const app = new cdk.App();
  const stack = new RdsSecretsStack(app, "TestRdsSecretsStack", {
    config: devConfig,
  });
  const template = Template.fromStack(stack);

  test("creates a Postgres RDS instance encrypted at rest", () => {
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      StorageEncrypted: true,
    });
  });

  test("generates DB credentials in Secrets Manager, not hard-coded", () => {
    template.resourceCountIs("AWS::SecretsManager::Secret", 2);
  });

  test("publishes the DB endpoint as a plain String parameter, not SecureString", () => {
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Type: "String",
      Name: `/${devConfig.envName}/rds/endpoint`,
    });
  });
});

describe("RdsSecretsStack config differences between environments", () => {
  test("prod is Multi-AZ, deletion-protected, and retained; dev is none of those", () => {
    const app = new cdk.App();
    const devStack = new RdsSecretsStack(app, "DevDbTest", {
      config: devConfig,
    });
    const prodStack = new RdsSecretsStack(app, "ProdDbTest", {
      config: prodConfig,
    });

    const devTemplate = Template.fromStack(devStack);
    const prodTemplate = Template.fromStack(prodStack);

    devTemplate.hasResourceProperties("AWS::RDS::DBInstance", {
      MultiAZ: false,
      DeletionProtection: false,
      BackupRetentionPeriod: 0,
    });
    devTemplate.hasResource("AWS::RDS::DBInstance", {
      DeletionPolicy: "Delete",
    });

    prodTemplate.hasResourceProperties("AWS::RDS::DBInstance", {
      MultiAZ: true,
      DeletionProtection: true,
      BackupRetentionPeriod: 7,
    });
    prodTemplate.hasResource("AWS::RDS::DBInstance", {
      DeletionPolicy: "Retain",
    });
  });
});
