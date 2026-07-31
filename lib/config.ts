export interface EnvironmentConfig {
  envName: "dev" | "prod";
  natGateways: number;
  desiredCount: number;
}

export const devConfig: EnvironmentConfig = {
  envName: "dev",
  natGateways: 1,
  desiredCount: 1,
};

export const prodConfig: EnvironmentConfig = {
  envName: "prod",
  natGateways: 2,
  desiredCount: 2,
};
