import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ArtifactStack, NetworkStack, deploymentConfig } from "./stack.ts";

const config = {
  account: "111111111111",
  region: "us-east-2",
  cloudFrontPrefixListId: "pl-123abc",
  secretArn:
    "arn:aws:secretsmanager:us-east-2:111111111111:secret:network-fixture-abcdef",
  imageTag: "a".repeat(40),
};
test("deployment refuses missing settings, unreviewed image tags and foreign secrets", () => {
  for (const changes of [
    { hostname: "" },
    { hostname: "https://example.test/path" },
    { imageTag: "latest" },
    { secretArn: config.secretArn.replace("111111111111", "222222222222") },
    {
      hostname: "network.example.test",
      certificateArn: "arn:aws:acm:us-east-2:111111111111:certificate/fixture",
    },
    { cloudFrontPrefixListId: "pl-invalid" },
  ]) {
    assert.throws(() => deploymentConfig({ ...config, ...changes }));
  }
});
test("private build source, immutable images and bounded cloud builds preserve rollback releases", () => {
  const app = new App();
  const stack = new ArtifactStack(app, "ArtifactFixture", config);
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    VersioningConfiguration: { Status: "Enabled" },
  });
  template.hasResourceProperties("AWS::ECR::Repository", {
    ImageTagMutability: "IMMUTABLE",
    ImageScanningConfiguration: { ScanOnPush: true },
  });
  template.hasResourceProperties("AWS::CodeBuild::Project", {
    TimeoutInMinutes: 20,
    ConcurrentBuildLimit: 1,
  });
  const policies = JSON.stringify(template.findResources("AWS::IAM::Policy"));
  assert.equal(
    policies.includes("secretsmanager:GetSecretValue"),
    false,
    "build cannot read runtime secrets",
  );
});
test("web accepts only load-balancer traffic, workers have no ingress, and runtime secrets stay out of plain environment", () => {
  const app = new App();
  const artifacts = new ArtifactStack(app, "ArtifactFixture", config);
  const stack = new NetworkStack(
    app,
    "NetworkFixture",
    config,
    artifacts.repository,
  );
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::RDS::DBInstance", 0);
  template.resourceCountIs("AWS::ECS::Service", 2);
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
    Port: 80,
    Protocol: "HTTP",
  });
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckPath: "/api/health",
  });
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
    Scheme: "internal",
  });
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      ViewerCertificate: Match.absent(),
      DefaultCacheBehavior: Match.objectLike({
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: [
          "GET",
          "HEAD",
          "OPTIONS",
          "PUT",
          "PATCH",
          "POST",
          "DELETE",
        ],
      }),
    }),
  });
  template.resourceCountIs("AWS::CloudFront::VpcOrigin", 1);
  assert.equal(template.toJSON().Parameters?.BootstrapVersion, undefined);
  const groups = template.findResources("AWS::EC2::SecurityGroup");
  const worker = Object.entries(groups).find(([id]) =>
    id.startsWith("WorkerNetwork"),
  )![1];
  assert.equal(worker.Properties.SecurityGroupIngress, undefined);
  const ingress = Object.values(
    template.findResources("AWS::EC2::SecurityGroupIngress"),
  );
  assert.ok(
    ingress.some(
      (r) =>
        r.Properties.FromPort === 3000 && r.Properties.SourceSecurityGroupId,
    ),
  );
  assert.equal(
    ingress.some((r) => r.Properties.FromPort === 3000 && r.Properties.CidrIp),
    false,
  );
  for (const task of Object.values(
    template.findResources("AWS::ECS::TaskDefinition"),
  )) {
    const container = task.Properties.ContainerDefinitions[0];
    assert.equal(container.User, "1000:1000");
    assert.equal(
      container.Environment.some((e: { Name: string }) =>
        ["DATABASE_URL", "BETTER_AUTH_SECRET", "PRIVATE_USER_EMAILS"].includes(
          e.Name,
        ),
      ),
      false,
    );
    assert.ok(
      container.Secrets.some(
        (e: { Name: string }) => e.Name === "DATABASE_URL",
      ),
    );
  }
  template.hasResourceProperties("AWS::ECS::Service", {
    DesiredCount: 1,
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    }),
  });
});
