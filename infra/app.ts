import { App } from "aws-cdk-lib";
import { ArtifactStack, NetworkStack, deploymentConfig } from "./stack.ts";

const app = new App();
const target = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? "",
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-2",
};
if (!/^\d{12}$/.test(target.account))
  throw new Error("Resolve the AWS account before deployment");
const artifacts = new ArtifactStack(app, "NetworkOsArtifacts", target);
if (app.node.tryGetContext("artifactsOnly") !== "true") {
  const config = deploymentConfig({
    ...target,
    hostname: app.node.tryGetContext("hostname"),
    certificateArn: app.node.tryGetContext("certificateArn"),
    secretArn: app.node.tryGetContext("secretArn"),
    imageTag: app.node.tryGetContext("imageTag"),
  });
  new NetworkStack(app, "NetworkOs", config, artifacts.repository);
}
