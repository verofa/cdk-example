import * as cdk from "aws-cdk-lib/core";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EcsAlbStack } from "../lib/ecs-alb-stack";
import { devConfig, prodConfig } from "../lib/config";

describe("EcsAlbStack", () => {
  const app = new cdk.App();
  const stack = new EcsAlbStack(app, "TestEcsAlbStack", { config: devConfig });
  const template = Template.fromStack(stack);

  test("creates exactly one ECS cluster", () => {
    template.resourceCountIs("AWS::ECS::Cluster", 1);
  });

  test("Fargate service runs the configured task count", () => {
    template.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: devConfig.desiredCount,
      LaunchType: "FARGATE",
    });
  });

  test("task definition has one container listening on port 80", () => {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          PortMappings: Match.arrayWith([
            Match.objectLike({ ContainerPort: 80 }),
          ]),
        }),
      ]),
    });
  });
});

describe("EcsAlbStack config differences between environments", () => {
  test("prod gets 2 NAT gateways for HA, dev gets 1 to save cost", () => {
    const app = new cdk.App();
    const devStack = new EcsAlbStack(app, "DevTest", { config: devConfig });
    const prodStack = new EcsAlbStack(app, "ProdTest", { config: prodConfig });

    Template.fromStack(devStack).resourceCountIs("AWS::EC2::NatGateway", 1);
    Template.fromStack(prodStack).resourceCountIs("AWS::EC2::NatGateway", 2);
  });
});
