// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";
import { Oidc } from "../common";

import { generators } from "openid-client";

type OAUTHLoginContext = {
  OAUTH_RESPONSE_TYPES: string;
};

type OAUTHLoginEvent = {
  state?: string;
};

export const handler: ServerlessFunctionSignature<
  OAUTHLoginContext,
  OAUTHLoginEvent
> = async function (
  context: OAUTHLoginContext,
  event: OAUTHLoginEvent,
  callback: ServerlessCallback
) {
  const response = new Twilio.Response();
  try {
    let oidc = await Oidc();
    console.log("OAUTH/LOGIN", event);

    let redirect_url = oidc.client.authorizationUrl({
      scope: "openid email profile",
      response_mode: "form_post",
      response_type: "code",
    });

    if (!redirect_url || redirect_url === "")
      throw "OIDC client auth URL is blank";

    if (event.state) redirect_url += "&state=" + event.state;

    console.log("OAUTH/LOGIN redirecting client to:", redirect_url);
    response.appendHeader("location", redirect_url);
    response.setStatusCode(302);
  } catch (e) {
    console.error("[FATAL] OAuth error", e);
    response.setBody("OAuth error, see logs");
    response.setStatusCode(500);
  }

  return callback(null, response);
};
