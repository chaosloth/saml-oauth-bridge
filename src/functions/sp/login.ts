// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import * as Common from "../common.protected";
const { sp, idp } = <typeof Common>(
  require(Runtime.getFunctions()["common"].path)
);

export const handler: ServerlessFunctionSignature = async function (
  context: Context,
  event: {},
  callback: ServerlessCallback
) {
  console.log("SSO/LOGIN: New event arrived", event);
  const response = new Twilio.Response();

  try {
    const { id, context } = await sp.createLoginRequest(idp, "redirect");
    console.log("SSO/LOGIN: ID", id);
    console.log("SSO/LOGIN: Context", context);

    response.setBody(context);
    response.appendHeader("location", context);
    response.setStatusCode(302);
  } catch (e) {
    console.error("[FATAL] when parsing login response sent from IDP", e);
    response.setBody("IDP is incorrectly configured for IDP initiated SSO");
    response.setStatusCode(500);
  }

  return callback(null, response);
};
