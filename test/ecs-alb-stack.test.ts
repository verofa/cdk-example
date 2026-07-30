import * as cdk from "aws-cdk-lib/core";
import { Template, Match } from "aws-cdk-lib/assertions";
import { EcsAlbStack } from "../lib/ecs-alb-stack";
import { ContainerDefinition } from "aws-cdk-lib/aws-ecs";

describe("EcsAlbStack", () => {
  const app = new cdk.App();
  const stack = new EcsAlbStack(app, "TestEcsAlbStack");
  const template = Template.fromStack(stack);

  test("creates exactly one ECS cluster", () => {
    template.resourceCountIs("AWS::ECS::Cluster", 1);
  });

  test("Fargate service runs 2 tasts", () => {
    template.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 2,
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
