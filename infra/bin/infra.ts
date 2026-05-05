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
// Sprint 8 (BL-203 follow-on): bump 1024/2048 → 2048/4096 for MediaPipe
// FaceMesh per PRD-020 §4.1. Per-frame CPU budget at 5 FPS × 3 faces:
//   YOLO ~50ms + BoT-SORT ~5ms + 3× FaceMesh ~30ms ≈ 145ms < 200ms.
// Sprint 10 will bump again to 2048/6144 for ArcFace embeddings (BL-203
// is the file's last touch this sprint; revisit in Sprint 10).
new AiServiceStack(app, 'HorusEye-AiService-Staging', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai-staging',
  envName: 'staging',
  desiredCount: 1,
  cpu: 2048,
  memoryLimitMiB: 4096,
});

new AiServiceStack(app, 'HorusEye-AiService-Production', {
  env,
  vpc: network.vpc,
  repository: registry.aiServiceRepository,
  domainName,
  subdomain: 'ai',
  envName: 'production',
  desiredCount: 1,
  cpu: 2048,
  memoryLimitMiB: 4096,
});
