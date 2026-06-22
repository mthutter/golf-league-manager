import { SinchClient } from "@sinch/sdk-core";

const sinchClient = new SinchClient({
  // SMS Service Plan
  projectId: "dfa3761c-9068-4a74-b513-a0eeeefcae65",
  keyId: "9988ea55-b855-486f-bd4a-15d4570933ef",
  keySecret: "DQnZYLP~fnY.FN5rLzq0h~nX2c",
});

async function run() {
  const response = await sinchClient.conversation.messages.send({
    sendMessageRequestBody: {
      app_id: "01KVR6F5TTXMMPNJ8J3PXQ5FSP",
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
          text: "BOTTOMS-UP: Tee-times for 6/22 (Week 8) are posted.",
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
