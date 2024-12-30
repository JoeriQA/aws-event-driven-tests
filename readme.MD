# aws-event-driven-tests

## Overview

This project provides a framework for setting up event-driven tests in AWS. It includes utilities for interacting with AWS services such as SSM Parameter Store, STS, EventBridge, and CloudWatch Logs.

## Features

- Retrieve parameters from AWS SSM Parameter Store.
- Assume roles and obtain temporary AWS credentials using STS.
- Publish events to AWS EventBridge.
- Poll CloudWatch Logs to verify if specific events have been produced.

## Usage

### Initialization

Create an instance of the `AwsFuncs` class by providing the environment and CI flag.

```typescript
const awsFuncs = new AwsFuncs('staging', process.env.CI);
```

### Retrieve Parameters

Use the `getParams` method to fetch parameters from SSM Parameter Store.

```typescript
const params = await awsFuncs.getParams([{ awsName: '/path/to/param', isSecret: true, propName: 'paramName' }]);
```

### Publish Event

Publish an event to EventBridge using the `publishEventAsync` method.

```typescript
await awsFuncs.publishEventAsync('EventName', { key: 'value' });
```

### Verify Event Production

Poll CloudWatch Logs to check if an event matching the filter pattern has been produced.

```typescript
const event = await awsFuncs.eventProducedAsync(new Date(), '{ $.key = "value" }', '/aws/lambda/logGroupName');
```

### Post Event to EventBridge

Post an event to EventBridge using the AWS SDK v3.

```typescript
await awsFuncs.postEventBus({
  Entries: [
    {
      EventBusName: 'default',
      Source: 'source',
      DetailType: 'detailType',
      Detail: JSON.stringify({ key: 'value' }),
    },
  ],
});
```

## Conclusion

This framework simplifies the process of setting up and running event-driven tests in AWS, making it easier for test engineers to validate event flows and interactions within their AWS environment.
