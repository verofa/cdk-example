#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { AppStage } from "../lib/pipeline-stage";
import { devConfig, prodConfig } from "../lib/config";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new AppStage(app, "Dev", { env, config: devConfig });
new AppStage(app, "Prod", { env, config: prodConfig });
