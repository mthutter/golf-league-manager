import { SinchClient } from "@sinch/sdk-core";

const sinchClient = new SinchClient({
  // SMS Service Plan
  projectId: "0ed0d43284944d27bfe3f5e983168b9f",
  keyId: "9988ea55-b855-486f-bd4a-15d4570933ef",
  keySecret: "DQnZYLP~fnY.FN5rLzq0h~nX2c",
});

async function run() {
  const response = await sinchClient.conversation.messages.send({
    sendMessageRequestBody: {
      app_id: "0ed0d43284944d27bfe3f5e983168b9f",
      recipient: {
        identified_by: {
          channel_identities: [
            {
              channel: "SMS",
              identity: "17192001629",
            },
          ],
        },
      },
      message: {
        text_message: {
          text: "This is a test message using the Sinch Node.js SDK",
        },
      },
      channel_properties: {
        SMS_SENDER: "12085689687",
      },
    },
  });

  console.log(JSON.stringify(response));
}
run();
