// AI service Fargate stack — PRD-013 §12 + PRD-019 §4.4.
// FastAPI + WebSocket service, served behind a public ALB with HTTPS on
// ai-staging.horuseye.app / ai.horuseye.app. WebSocket idle timeout is
// raised to 15 min so frame-publishing connections aren't dropped.
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AiServiceStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  repository: ecr.Repository;
  domainName: string;
  /** Required — apex (no subdomain) is reserved for the portal. */
  subdomain: string;
  desiredCount: number;
  cpu: number;
  memoryLimitMiB: number;
  /** Which environment SSM prefix to read from. */
  envName: 'staging' | 'production';
}

export class AiServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AiServiceStackProps) {
    super(scope, id, props);

    const fqdn = `${props.subdomain}.${props.domainName}`;
    const ssmPrefix = `/horuseye/${props.envName}`;

    // ── DNS + TLS ────────────────────────────────────────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainName,
    });

    const certificate = new acm.Certificate(this, 'Cert', {
      domainName: fqdn,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── ECS cluster ──────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ── Task definition ──────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.cpu,
      memoryLimitMiB: props.memoryLimitMiB,
    });

    // SSM-backed secrets (re-using the portal's keys so handshakes match).
    const aiServiceApiKey = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/AI_SERVICE_API_KEY`);
    const pairTokenSecret = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/PAIR_TOKEN_SECRET`);
    // BL-185 — Supabase service-role client for incident persistence.
    const supabaseUrl = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SUPABASE_URL`);
    const supabaseServiceRoleKey = ssm.StringParameter.valueFromLookup(this, `${ssmPrefix}/SUPABASE_SERVICE_ROLE_KEY`);

    taskDef.addContainer('ai-service', {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `horuseye-ai-${props.envName}`,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        HORUSEYE_ENV: props.envName,
        AI_SERVICE_API_KEY: aiServiceApiKey,
        PAIR_TOKEN_SECRET: pairTokenSecret,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
        CORS_ORIGINS: props.envName === 'production'
          ? 'https://horuseye.app'
          : 'https://staging.horuseye.app,https://horuseye.app',
        PYTHONUNBUFFERED: '1',
      },
      portMappings: [{ containerPort: 8000 }],
    });

    // ── Fargate service ──────────────────────────────────────────
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: props.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      // YOLO weights pre-bake + first inference warm-up takes a while.
      healthCheckGracePeriod: cdk.Duration.seconds(180),
    });

    // ── ALB with WS-friendly idle timeout ────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      idleTimeout: cdk.Duration.minutes(15),
    });

    alb.addListener('HttpRedirect', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    const httpsListener = alb.addListener('Https', {
      port: 443,
      certificates: [certificate],
    });

    httpsListener.addTargets('EcsTarget', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        timeout: cdk.Duration.seconds(10),
      },
    });

    // ── DNS record ───────────────────────────────────────────────
    new route53.ARecord(this, 'DnsRecord', {
      zone: hostedZone,
      recordName: props.subdomain,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb),
      ),
    });

    // ── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'Url', { value: `https://${fqdn}` });
    new cdk.CfnOutput(this, 'WsUrl', { value: `wss://${fqdn}` });
    new cdk.CfnOutput(this, 'AlbDns', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ServiceArn', { value: service.serviceArn });
    new cdk.CfnOutput(this, 'ClusterArn', { value: cluster.clusterArn });
  }
}
