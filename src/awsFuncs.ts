import * as AWS from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
import { AssumeRoleRequest, Credentials } from 'aws-sdk/clients/sts';
import { EventBridgeClient, PutEventsCommand, PutEventsCommandInput } from '@aws-sdk/client-eventbridge';
import { FilterLogEventsRequest, FilterLogEventsResponse } from 'aws-sdk/clients/cloudwatchlogs';
import { PutEventsRequest, PutEventsRequestEntry } from 'aws-sdk/clients/eventbridge';
import { addMinutes, subSeconds } from 'date-fns';
import assert from 'assert';

interface Params {
  awsName: string;
  isSecret: boolean;
  propName?: string;
}

interface DynamicDictionary {
  [key: string]: any;
}

export class AwsFuncs {
  private credentials: Credentials | null;
  private ssm: AWS.SSM;
  private readonly env: string;
  private readonly isCI: string;

  // Initialize AWS credentials and environment settings
  constructor(node_env: string, isCI: string | undefined) {
    this.credentials = null;
    this.isCI = isCI ?? 'false';
    if (this.isCI === 'false') {
      AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: 'default' });
      AWS.config.update({ region: 'eu-west-1' });
    }
    this.ssm = new AWS.SSM();
    this.env = ['staging', 'accept', 'acceptance'].includes(node_env.toLowerCase()) ? 'Staging' : 'Development';
  }

  // Create a dynamic dictionary to store parameter values
  private createDynamicDictionary(): DynamicDictionary {
    return new Proxy({} as DynamicDictionary, {
      get: (target, prop: string) => {
        if (!(prop in target)) {
          target[prop] = null;
        }
        return target[prop];
      },
    });
  }

  // Retrieve parameters from AWS SSM Parameter Store
  async getParams(params: Params[]) {
    const credentials = this.isCI === 'true' ? await this.getCredentialsAsync() : undefined;
    this.ssm = new AWS.SSM({
      accessKeyId: credentials?.AccessKeyId,
      secretAccessKey: credentials?.SecretAccessKey,
      sessionToken: credentials?.SessionToken,
    });

    const params1 = await this.getFromParameterStore(params, true);
    const params2 = await this.getFromParameterStore(params, false);

    return { ...params1, ...params2 };
  }

  // Helper method to get parameters from SSM Parameter Store with or without decryption
  private async getFromParameterStore(params: Params[], withDecryption: boolean) {
    const myParams = this.createDynamicDictionary();

    const paramRequest = {
      Names: params.filter((p) => p.isSecret === withDecryption).map((p) => p.awsName),
      WithDecryption: withDecryption,
    };
    if (paramRequest.Names.length === 0) return null;

    try {
      const data: PromiseResult<any, any> = await this.ssm.getParameters(paramRequest).promise();
      if (data.Parameters) {
        params
          .filter((p) => p.isSecret === withDecryption)
          .forEach((p) => {
            let propName = p.propName ?? p.awsName.substring(p.awsName.lastIndexOf('/') + 1);
            propName = propName.charAt(0).toLowerCase() + propName.slice(1);
            myParams[propName] = data.Parameters.find((item: any) => item.Name === p.awsName).Value;
          });
      }
    } catch (err: any) {
      console.error(err, err.stack);
    }

    return myParams;
  }

  // Retrieve temporary AWS credentials using STS assume role
  async getCredentialsAsync() {
    if (
      this.isCI === 'false' ||
      (this.credentials?.Expiration && new Date(this.credentials.Expiration).getTime() > Date.now())
    ) {
      return this.credentials;
    }

    const securityTokenService = new AWS.STS();

    try {
      const callerIdentity = await securityTokenService.getCallerIdentity({}).promise();

      const assumeRoleRequest: AssumeRoleRequest = {
        RoleArn: `arn:aws:iam::${callerIdentity.Account}:role/Example-${this.env}-Test-ExecutionRole`,
        RoleSessionName: `tests-execution-${new Date().toISOString().replace(/[:-]/g, '').substring(0, 15)}`,
        DurationSeconds: 900,
      };

      const assumeRoleResponse = await securityTokenService.assumeRole(assumeRoleRequest).promise();
      this.credentials = assumeRoleResponse.Credentials ?? null;

      if (!this.credentials) {
        throw new Error('Failed to assume role');
      }

      return this.credentials;
    } catch (err) {
      console.error('An error occurred while getting credentials:', err);
      throw err;
    }
  }

  // Publish an event to AWS EventBridge
  async publishEventAsync<T>(
    eventName: string,
    payload: T,
    eventBusName: string = `aws/events/Example-${this.env === 'Staging' ? 'stg' : 'dev'}`,
  ): Promise<void> {
    const eventBridgeClient = new AWS.EventBridge({ region: 'eu-west-1' });

    await this.getCredentialsAsync();

    const request: PutEventsRequest = {
      Entries: [
        {
          EventBusName: eventBusName,
          Source: `Example.Integration.Tests`,
          DetailType: eventName,
          Detail: JSON.stringify(payload),
        } as PutEventsRequestEntry,
      ],
    };

    try {
      await eventBridgeClient.putEvents(request).promise();
    } catch (error) {
      console.error('Error putting events:', error);
    }
  }

  // Poll CloudWatch Logs to check if an event matching the filter pattern has been produced
  async eventProducedAsync(startTime: Date, filterPattern: string, logGroupName: string, maxDuration: number = 90000) {
    const creds = await this.getCredentialsAsync();

    const cloudWatchLogsClient = new AWS.CloudWatchLogs({
      accessKeyId: creds?.AccessKeyId,
      secretAccessKey: creds?.SecretAccessKey,
      sessionToken: creds?.SessionToken,
    });

    let currentDelay = 2000;
    let response: FilterLogEventsResponse;

    const startTimeStamp = Date.now();
    const hasTimedOut = () => Date.now() - startTimeStamp > maxDuration;
    const endTime = addMinutes(new Date(), maxDuration / 1000 / 60);

    // Subtracting 2 seconds from the start time to make sure the event is ingested
    startTime = subSeconds(startTime, 2);

    console.log(`searching ${filterPattern} in log group ${logGroupName}`);

    try {
      do {
        await new Promise((resolve) => setTimeout(resolve, currentDelay));

        if (hasTimedOut()) {
          throw new Error('Max polling duration reached');
        }

        currentDelay = 1000;

        const request: FilterLogEventsRequest = {
          startTime: startTime.getTime(),
          endTime: endTime.getTime(),
          logGroupName: logGroupName,
          filterPattern: filterPattern,
        };

        response = await cloudWatchLogsClient.filterLogEvents(request).promise();
      } while (response.events?.length === 0);

      assert.strictEqual(response.events?.length, 1);
      if (response.events[0].message) return JSON.parse(response.events[0].message);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
        assert.fail('Operation timed-out.');
      } else {
        throw error;
      }
    }
  }

  // Post an event to EventBridge using the AWS SDK v3
  async postEventBus(message: PutEventsCommandInput) {
    const client = new EventBridgeClient(AWS.SSM);
    const command = new PutEventsCommand(message);
    return await client.send(command);
  }
}
