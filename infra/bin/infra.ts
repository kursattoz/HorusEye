#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { RegistryStack } from '../lib/registry-stack';
import { ServiceStack } from '../lib/service-stack';
import { AiServiceStack } from '../lib/ai-service-stack';

const app = new cdk.App();

const domainName = app.node.tryGetContext('domainName') ?? 'horuseye.app';

const env: cdk.Environment = {
  account: app.node.tryGetContext('awsAccount') || process.env.CDK_DEFAULT_ACCOUNT,
  region: app.node.tryGetContext('awsRegion') || process.env.CDK_DEFAULT_REGION,
};

// ── Shared stacks ────────────────────────────────────────────────
const network = new NetworkStack(app, 'HorusEye-Network', { env });

const registry = new RegistryStack(app, 'HorusEye-Registry', { env });

// ── Per-environment service stacks ───────────────────────────────
new ServiceStack(app, 'HorusEye-Staging', {
  env,
  vpc: network.vpc,
  repository: registry.repository,
  domainName,
  subdomain: 'staging',
  desiredCount: 1,
  cpu: 256,
  memoryLimitMiB: 512,
});

new ServiceStack(app, 'HorusEye-Production', {
  env,
  vpc: network.vpc,
  repository: registry.repository,
  domainName,
  subdomain: undefined, // apex domain
  desiredCount: 2,
  cpu: 256,
  memoryLimitMiB: 512,
});

// ── AI service stacks (PRD-019, PRD-020) ─────────────────────────
// Sprint 10 close: bump memory 4096 → 6144 for ArcFace ResNet50.
// Sprint 17 (BL-305): bump CPU 2048 → 4096 and memory 6144 → 8192 to
// fit MediaPipe Pose on every active track. Pose adds ~80ms per ROI on
// 2 vCPU; doubling cores keeps the per-frame budget under our 200ms
// target at the typical 4-track classroom load.
new AiServiceStack(app, 'HorusEye-AiService-Staging', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai-staging',
  envName: 'staging',
  desiredCount: 1,
  cpu: 4096,
  memoryLimitMiB: 8192,
});

new AiServiceStack(app, 'HorusEye-AiService-Production', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai',
  envName: 'production',
  desiredCount: 1,
  cpu: 4096,
  memoryLimitMiB: 8192,
});
