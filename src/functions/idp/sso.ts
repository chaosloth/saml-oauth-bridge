import "@twilio-labs/serverless-runtime-types";
import {
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import { sp, idp, Oidc, StateTransfer, encode } from "../common";

type SSORequestEvent = {
  SAMLRequest?: string;
  RelayState?: string;
  SigAlg?: string;
  Signature?: string;
};

type SSORequestContext = {
  ACCOUNT_SID: string;
  OAUTH_RESPONSE_TYPES: string;
  OAUTH_SCOPES: string;
  OAUTH_RESPONSE_MODE: string;
  OAUTH_RESPONSE_TYPE: string;
};

export const handler: ServerlessFunctionSignature<
  SSORequestContext,
  SSORequestEvent
> = async function (
  context: SSORequestContext,
  event: SSORequestEvent,
  callback: ServerlessCallback
) {
  console.log("IDP/SSO: New event arrived", event);
  const response = new Twilio.Response();

  let { SAMLRequest, RelayState } = event;

  try {
    // ***************************************************************************
    // Ingest the SAML request from SP
    // ***************************************************************************
    const { extract } = await idp.parseLoginRequest(sp, "redirect", {
      body: SAMLRequest,
      query: event,
    });

    const constructedRequestInfo = {
      extract: { request: { id: extract.request.id } },
    };

    console.log("IDP/SSO: SP Request", extract);

    // ***************************************************************************
    // Call upstream OAuth provider
    // ***************************************************************************
    let oidc = await Oidc();

    let redirect_url = oidc.client.authorizationUrl({
      scope: context.OAUTH_SCOPES,
      response_mode: context.OAUTH_RESPONSE_MODE || "form_post",
      response_type: context.OAUTH_RESPONSE_TYPE || "code",
    });

    if (!redirect_url || redirect_url === "")
      throw "OIDC client auth URL is blank";

    if (!RelayState || !extract.request.id)
      throw "SAML RelayState or request_id not found";

    const state: StateTransfer = {
      request_id: extract.request.id,
      RelayState: RelayState,
    };

    redirect_url += "&state=" + encode(JSON.stringify(state));

    console.log("IDP/SSO redirecting client to:", redirect_url);
    response.appendHeader("location", redirect_url);
    response.setStatusCode(302);
  } catch (e) {
    // Possible errors: Ensure SP meta data has appropriate AssertionConsumerService binding(s)
    console.error("[FATAL] when parsing login response from IDP.", e);
    response.setBody(e ? e : "See logs");
    response.setStatusCode(500);
  }

  return callback(null, response);
};
