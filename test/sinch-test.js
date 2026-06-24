import { sinchClient } from "../config/text.js";

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
      channel_priority_order: ["SMS"],
      channel_credentials: [
        {
          channel: "SMS",
          static_bearer: {
            claimed_identity: "0ed0d43284944d27bfe3f5e983168b9f",
            token: "01KVR6F5TTXMMPNJ8J3PXQ5FSP",
          },
        },
      ],
      channel_properties: {
        SMS_SENDER: "17197527722",
      },
    },
  });

  console.log(JSON.stringify(response));
}
run();
