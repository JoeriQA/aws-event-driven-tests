import { AwsFuncs } from '../src/awsFuncs';
import { EnvisoAPI, ScanStatus, TicketType } from '../src/envisoAPI';
import { TicketingAPI } from '../src/ticketingAPI';

let params: { [x: string]: any; apiKey?: any; tenantKey?: any; salespointId?: any; publicKey?: any };

export const createEnvisoAPI = async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  params = await awsCreds.getParams([
    { awsName: `/MACH-dev/EnvisoOptions/ApiKey`, isSecret: true },
    { awsName: `/MACH-dev/EnvisoOptions/TenantKey`, isSecret: true },
    { awsName: `/MACH-dev/EnvisoOptions/SalespointId`, isSecret: false },
    { awsName: `/MACH-dev/EnvisoOptions/PublicKey`, isSecret: false },
  ]);

  return new EnvisoAPI({
    api: 'https://api.staging-enviso.io',
    apiKey: params.apiKey,
    tenant: params.tenantKey,
    salesID: params.salespointId,
  });
};

const getParkingTicket = async (): Promise<string> => {
  const ticketAPI = new TicketingAPI('https://cloud-dev.efteling.com/api');
  const machToken = await ticketAPI.login('autotest-nl@efteling.com', 'obelixeetwortels');
  const envisoApi = await createEnvisoAPI();
  const timeStamp = new Date().toISOString();
  const signature = envisoApi.createEnvisoSignature(params.apiKey + '_' + timeStamp, params.publicKey);
  const envisoToken = await envisoApi.loginDirectSellingAPI(timeStamp, signature);

  const order = await ticketAPI.getTestOrder(machToken, { price: 4.5 });
  const parkingTicketIDs = await envisoApi.getOrderTickets(envisoToken, order.id, TicketType.parking, ScanStatus.all);
  if (parkingTicketIDs.length === 0) throw new Error('No parking ticket found');
  return parkingTicketIDs[0];
};

test('Should post event', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const response = await awsCreds.postEventBus({
    Entries: [
      {
        Time: new Date(),
        Source: 'Efteling.Mach.Connectors.Adyen.Webhooks, Version=0.1.3.74, Culture=neutral, PublicKeyToken=null',
        Resources: [],
        DetailType: 'Payments.PaymentsConfirmed',
        Detail: JSON.stringify({
          payments: [
            {
              pspReference: 'GS65674PBD492P65',
              originalPspReference: null,
              amount: 745,
              method: 'ideal',
              merchantReference: '18eb3beb-d923-43f7-bec0-b148008e84e7',
              merchantAccount: 'EftelingECOM',
            },
          ],
          id: 'b231e48a-ca1f-4baa-883b-f4418711a3ef',
          dateTime: new Date(),
        }),
        EventBusName: 'arn:aws:events:eu-west-1:708551999344:event-bus/MACH-dev',
      },
    ],
  });
  expect(response.$metadata.httpStatusCode).toEqual(200);
});

test('Should read params from AWS', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const params = await awsCreds.getParams([
    { awsName: `/MACH-dev/EnvisoOptions/ApiKey`, isSecret: true },
    { awsName: `/MACH-dev/Connectors-Recreatex/Webhooks/HmacAuthentication/PrivateKey`, isSecret: true },
    { awsName: '/MACH-dev/EnvisoOptions/PublicKey', isSecret: false },
    { awsName: '/MACH-dev/EnvisoOptions/SalespointId', isSecret: false },
  ]);

  expect(params.apiKey).toMatch(/\S+/);
  expect(params.privateKey).toMatch(/\S+/);
  expect(params.publicKey).toMatch(/\S+/);
  expect(params.salespointId).toMatch(/\S+/);
});

test('Should read param from AWS with custom name', async () => {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const params = await awsCreds.getParams([
    {
      awsName: `/MACH-dev/EnvisoOptions/PublicKey`,
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

test('Should succesfully publish an event', async function () {
  const awsCreds = new AwsFuncs('Development', process.env.CI);
  const parkingTicket = await getParkingTicket();

  const payload = {
    uniqueTicketId: parkingTicket,
    transactionDateTime: new Date(),
  };

  const startTime = new Date();
  await awsCreds.publishEventAsync('AccessControlTransactionEvent', payload, `MACH-dev`);

  const filterPattern = `{ $.detail-type = "AccessControlTransactionProcessedEvent" && $.detail.transactionId = "${parkingTicket}" }`;
  const result = await awsCreds.eventProducedAsync(startTime, filterPattern, `/MACH-dev/Framework-EventBus`);
  expect(result).not.toBeNull();
  expect(result.detail.id).toMatch(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  );
}, 90000);
