import { AwsFuncs } from '../src/awsFuncs';

test('Should post event', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const response = await awsCreds.postEventBus({
    Entries: [
      {
        Time: new Date(),
        Source: 'Example.Test, Version=0.1.3.74, Culture=neutral, PublicKeyToken=null',
        Resources: [],
        DetailType: 'Example.EventName',
        Detail: JSON.stringify({
          eventPayload: {
            key1: 'value1',
            key2: 'value2',
          },
        }),
        EventBusName: 'arn:aws:events:eu-west-1:event-bus/Test-dev',
      },
    ],
  });
  expect(response.$metadata.httpStatusCode).toEqual(200);
});

test('Should read params from AWS', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const params = await awsCreds.getParams([
    { awsName: `/Example-dev/Secret/ApiKey`, isSecret: true },
    { awsName: '/Example-dev/NotASecret/Parameter', isSecret: false },
  ]);

  expect(params.apiKey).toMatch(/\S+/);
  expect(params.parameter).toMatch(/\S+/);
});

test('Should read param from AWS with custom name', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const params = await awsCreds.getParams([
    {
      awsName: `/Example-dev/NotASecret/Parameter`,
      isSecret: false,
      propName: 'myCustomName',
    },
  ]);

  expect(params).not.toHaveProperty('publicKey');
  expect(params.myCustomName).toMatch(/\S+/);
});

test('Should have AWS credentials', async () => {
  if (process.env.CI !== 'true') {
    console.log('dont need credentials locally');
    return;
  }

  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const credentials = await awsCreds.getCredentialsAsync();

  expect(credentials?.AccessKeyId).toMatch(/\S+/);
  expect(credentials?.SecretAccessKey).toMatch(/\S+/);
  expect(credentials?.SessionToken).toMatch(/\S+/);
});

test('Should successfully publish an event', async function () {
  const awsCreds = new AwsFuncs('Development', process.env.CI);

  const payload = {
    uniqueTicketId: 'fakeTicket123',
    transactionDateTime: new Date(),
  };

  const startTime = new Date();
  await awsCreds.publishEventAsync('TestEvent', payload, `TestBus`);

  const filterPattern = `{ $.detail-type = "TestEventProcessed" && $.detail.uniqueTicketId = "fakeTicket123" }`;
  const result = await awsCreds.eventProducedAsync(startTime, filterPattern, `/TestBus`);
  expect(result).not.toBeNull();
  expect(result.detail.id).toMatch(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  );
}, 90000);
