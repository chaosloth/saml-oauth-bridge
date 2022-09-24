import "@twilio-labs/serverless-runtime-types";
import {
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import * as Common from "../common.protected";
const { sp, idp, Oidc, encode } = <typeof Common>(
  require(Runtime.getFunctions()["common"].path)
);

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

  try {
    // ***************************************************************************
    // Pull out the SAMLRequest and RelayState
    // ***************************************************************************
    if (!event.SAMLRequest) throw "SAMLRequest not found for processing";
    if (!event.RelayState) throw "RelayState not found, needed for callback";

    // Redirect flow expects SAMLRequest as key in the query
    // Post flow expects the SAMLRequest in the body
    const { extract } = await idp.parseLoginRequest(sp, "redirect", {
      body: event.SAMLRequest,
      query: { SAMLRequest: event.SAMLRequest },
    });

    console.log("IDP/SSO: SP Request", extract);

    const constructedRequestInfo = {
      extract: { request: { id: extract.request.id } },
    };

    // ***************************************************************************
    //
    // TODO: Ensure validation of incoming SAMLRequest
    //
    // ***************************************************************************

    const state_transfer: Common.StateTransfer = {
      RelayState: event.RelayState,
      request_id: extract.request.id,
    };

    // ***************************************************************************
    // Call upstream OAuth provider
    // ***************************************************************************
    const state = encode(JSON.stringify(state_transfer));

    let oidc = await Oidc();

    let redirect_url = oidc.client.authorizationUrl({
      scope: context.OAUTH_SCOPES,
      response_mode: context.OAUTH_RESPONSE_MODE || "form_post",
      response_type: context.OAUTH_RESPONSE_TYPE || "code",
      state: encodeURI(state),
    });

    if (!redirect_url || redirect_url === "")
      throw "OIDC client auth URL is blank";

    console.log("IDP/SSO redirecting client to:", redirect_url);

    // ***************************************************************************
    // Construct a simple web form to auto-fetch response
    // ***************************************************************************
    let redirectForm = `
    <html>
      <body onload="document.location='${redirect_url}'"/>
    </html>
    `;
    response.setBody(redirectForm);

    // response.appendHeader("location", redirect_url);
    // response.setStatusCode(302);
  } catch (e) {
    // Possible errors: Ensure SP meta data has appropriate AssertionConsumerService binding(s)
    console.error("[FATAL] when parsing login response from IDP.", e);
    response.setBody(e ? e : "See logs");
    response.setStatusCode(500);
  }

  return callback(null, response);
};
