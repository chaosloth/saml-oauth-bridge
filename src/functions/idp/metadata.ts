// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import * as Common from "../common.protected";
const { idp } = <typeof Common>require(Runtime.getFunctions()["common"].path);

export const handler: ServerlessFunctionSignature = async function (
  context: Context,
  event: {},
  callback: ServerlessCallback
) {
  console.log("New event arrived", event);
  const response = new Twilio.Response();
  response.setBody(idp.getMetadata());
  return callback(null, response);
};
