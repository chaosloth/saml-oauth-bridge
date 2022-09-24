// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

export const handler: ServerlessFunctionSignature = async function (
  context: Context,
  event,
  callback: ServerlessCallback
) {
  const response = new Twilio.Response();
  response.setBody(event);
  return callback(null, response);
};
