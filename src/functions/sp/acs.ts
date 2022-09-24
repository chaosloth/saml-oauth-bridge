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

type SSOResponseEvent = {
  SAMLResponse?: string;
};

export const handler: ServerlessFunctionSignature = async function (
  context: Context,
  event: SSOResponseEvent,
  callback: ServerlessCallback
) {
  console.log("SSO/ACS: New event arrived", event);
  const response = new Twilio.Response();
  let { SAMLResponse } = event;

  try {
    const { extract } = await sp.parseLoginResponse(idp, "post", {
      body: { SAMLResponse },
    });
    console.log(extract);
    /*
     *
     *
     *    Do your logic here. extract.attributes, should contains : firstName, lastName, email, uid, groups
     *
     *
     */
    response.setBody(extract);
    response.setStatusCode(302);
  } catch (e) {
    console.error("[FATAL] when parsing login response sent from IDP", e);
    response.setHeaders({ location: "/" });
    response.setStatusCode(302);
  }

  return callback(null, response);
};
