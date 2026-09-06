import {
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  Tags,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_elasticloadbalancingv2 as elb,
  aws_certificatemanager as acm,
  aws_secretsmanager as secrets,
  aws_logs as logs,
  aws_s3 as s3,
  aws_codebuild as codebuild,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

type Config = {
  account: string;
  region: string;
  hostname: string;
  certificateArn: string;
  secretArn: string;
  imageTag: string;
};
export function deploymentConfig(raw: Record<keyof Config, unknown>): Config {
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`Missing deployment setting: ${key}`);
  }
  const value = raw as Config;
  if (
    !/^\d{12}$/.test(value.account) ||
    !/^[a-z]{2}-[a-z]+-\d$/.test(value.region)
  )
    throw new Error("Invalid AWS target");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value.hostname))
    throw new Error("Use a DNS hostname without scheme or path");
  if (!/^[a-f0-9]{40}$/.test(value.imageTag))
    throw new Error(
      "Use the full reviewed Git commit as the immutable image tag",
    );
  if (
    !value.certificateArn.startsWith(
      `arn:aws:acm:${value.region}:${value.account}:certificate/`,
    )
  )
    throw new Error("Certificate must belong to the target account and region");
  if (
    !value.secretArn.startsWith(
      `arn:aws:secretsmanager:${value.region}:${value.account}:secret:`,
    )
  )
    throw new Error("Secret must belong to the target account and region");
  return value;
}

// Deploy artifacts first, build the reviewed source, then deploy web/worker services.
export class ArtifactStack extends Stack {
  readonly repository: ecr.Repository;
  constructor(
    scope: Construct,
    id: string,
    target: { account: string; region: string },
  ) {
    super(scope, id, { env: target, terminationProtection: true });
    Tags.of(this).add("Application", "network-os");
    this.repository = new ecr.Repository(this, "Images", {
      repositoryName: "network-os",
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: Duration.days(14) },
      ],
    });
    const source = new s3.Bucket(this, "BuildSource", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          expiration: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(7),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
    const group = new logs.LogGroup(this, "BuildLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const project = new codebuild.Project(this, "Build", {
      source: codebuild.Source.s3({
        bucket: source,
        path: "releases/source.zip",
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      environmentVariables: {
        REPOSITORY_URI: { value: this.repository.repositoryUri },
        REGISTRY: {
          value: `${target.account}.dkr.ecr.${target.region}.amazonaws.com`,
        },
      },
      timeout: Duration.minutes(20),
      queuedTimeout: Duration.minutes(10),
      concurrentBuildLimit: 1,
      logging: { cloudWatch: { logGroup: group } },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "export IMAGE_TAG=$(cat release-commit.txt)",
              "echo \"$IMAGE_TAG\" | grep -Eq '^[a-f0-9]{40}$' || exit 1",
              'aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$REGISTRY"',
            ],
          },
          build: {
            commands: [
              'docker build --platform linux/amd64 -t "$REPOSITORY_URI:$IMAGE_TAG" .',
            ],
          },
          post_build: {
            commands: [
              'test "$CODEBUILD_BUILD_SUCCEEDING" = "1"',
              'docker push "$REPOSITORY_URI:$IMAGE_TAG"',
            ],
          },
        },
      }),
    });
    this.repository.grantPullPush(project);
    new CfnOutput(this, "SourceBucket", { value: source.bucketName });
    new CfnOutput(this, "BuildProject", { value: project.projectName });
    new CfnOutput(this, "ImageRepository", {
      value: this.repository.repositoryUri,
    });
  }
}

/** Initial Neon-backed deployment; no source database changes or RDS cutover. */
export class NetworkStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    config: Config,
    repository: ecr.IRepository,
  ) {
    super(scope, id, {
      env: { account: config.account, region: config.region },
      terminationProtection: true,
    });
    Tags.of(this).add("Application", "network-os");
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const secret = secrets.Secret.fromSecretCompleteArn(
      this,
      "RuntimeSecret",
      config.secretArn,
    );
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      config.certificateArn,
    );
    const loadBalancer = new elb.ApplicationLoadBalancer(this, "Https", {
      vpc,
      internetFacing: true,
      dropInvalidHeaderFields: true,
    });
    const listener = loadBalancer.addListener("Tls", {
      port: 443,
      certificates: [certificate],
      sslPolicy: elb.SslPolicy.RECOMMENDED_TLS,
    });
    loadBalancer.addRedirect({
      sourcePort: 80,
      targetPort: 443,
      targetProtocol: elb.ApplicationProtocol.HTTPS,
    });

    const webSg = new ec2.SecurityGroup(this, "WebNetwork", {
      vpc,
      allowAllOutbound: false,
    });
    webSg.addIngressRule(
      loadBalancer.connections.securityGroups[0],
      ec2.Port.tcp(3000),
      "Only the HTTPS load balancer",
    );
    const workerSg = new ec2.SecurityGroup(this, "WorkerNetwork", {
      vpc,
      allowAllOutbound: false,
      description: "Outbound-only interview worker",
    });
    for (const group of [webSg, workerSg]) {
      group.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        "AWS APIs and configured HTTPS providers",
      );
      group.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(5432),
        "TLS PostgreSQL during the Neon transition",
      );
    }
    const environment = {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      BETTER_AUTH_URL: `https://${config.hostname}`,
      DATABASE_POOL_SIZE: "5",
    };
    const fields = [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "PRIVATE_USER_EMAILS",
      "OPENROUTER_API_KEY",
      "NETWORK_INTERVIEW_MODEL",
    ];
    const makeTask = (
      name: string,
      cpu: number,
      memory: number,
      worker: boolean,
    ) => {
      const task = new ecs.FargateTaskDefinition(this, `${name}Task`, {
        cpu,
        memoryLimitMiB: memory,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });
      const group = new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      const container = task.addContainer(name, {
        image: ecs.ContainerImage.fromEcrRepository(
          repository,
          config.imageTag,
        ),
        environment,
        secrets: Object.fromEntries(
          (worker
            ? fields.filter(
                (field) =>
                  ![
                    "BETTER_AUTH_SECRET",
                    "GOOGLE_CLIENT_ID",
                    "GOOGLE_CLIENT_SECRET",
                  ].includes(field),
              )
            : fields
          ).map((field) => [
            field,
            ecs.Secret.fromSecretsManager(secret, field),
          ]),
        ),
        logging: ecs.LogDrivers.awsLogs({
          logGroup: group,
          streamPrefix: name,
        }),
        user: "1000:1000",
        stopTimeout: Duration.seconds(60),
        ...(worker
          ? {
              command: ["node", "--import", "tsx", "scripts/network-worker.ts"],
            }
          : {}),
      });
      if (!worker) container.addPortMappings({ containerPort: 3000 });
      return task;
    };
    const web = new ecs.FargateService(this, "Web", {
      cluster,
      taskDefinition: makeTask("Web", 512, 1024, false),
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [webSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(90),
      enableExecuteCommand: false,
    });
    new ecs.FargateService(this, "Worker", {
      cluster,
      taskDefinition: makeTask("Worker", 256, 512, true),
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [workerSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      enableExecuteCommand: false,
    });
    listener.addTargets("WebTargets", {
      port: 3000,
      protocol: elb.ApplicationProtocol.HTTP,
      targets: [web],
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: Duration.seconds(30),
      },
      deregistrationDelay: Duration.seconds(30),
    });
    new CfnOutput(this, "AppUrl", { value: `https://${config.hostname}` });
    new CfnOutput(this, "DnsTarget", {
      value: loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "ImageRepository", { value: repository.repositoryUri });
  }
}
