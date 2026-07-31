import * as cdk from "aws-cdk-lib/core";

export interface EnvironmentConfig {
  envName: "dev" | "prod";
  natGateways: number;
  desiredCount: number;
  dbMultiAz: boolean;
  dbRemovalPolicy: cdk.RemovalPolicy;
  dbDeletionProtection: boolean;
}

export const devConfig: EnvironmentConfig = {
  envName: "dev",
  natGateways: 1,
  desiredCount: 1,
  dbMultiAz: false,
  dbRemovalPolicy: cdk.RemovalPolicy.DESTROY,
  dbDeletionProtection: false,
};

export const prodConfig: EnvironmentConfig = {
  envName: "prod",
  natGateways: 2,
  desiredCount: 2,
  dbMultiAz: true,
  dbRemovalPolicy: cdk.RemovalPolicy.RETAIN,
  dbDeletionProtection: true,
};
