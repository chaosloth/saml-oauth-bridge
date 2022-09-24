// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import * as Common from "../common.protected";
const { createTemplateCallback, decode, idp, Oidc, sp } = <typeof Common>(
  require(Runtime.getFunctions()["common"].path)
);

import { generators } from "openid-client";
import * as saml from "samlify";
import { PostBindingContext } from "samlify/types/src/entity";

export type OAuthCallbackEvent = {
  code?: string;
  [key: string]: any;
};

type OAuthCallbackContext = {
  ACCOUNT_SID: string;
  OAUTH_REDIRECT_URI: string;
};

export const handler: ServerlessFunctionSignature<
  OAuthCallbackContext,
  OAuthCallbackEvent
> = async function (
  context: OAuthCallbackContext,
  event: OAuthCallbackEvent,
  callback: ServerlessCallback
) {
  const response = new Twilio.Response();
  try {
    console.log("OAUTH/CALLBACK", event);

    // ***************************************************************************
    // VALIDATE OAUTH TOKENS
    // ***************************************************************************
    if (!event.code) throw "OAUTH code not found in request";
    let oidc = await Oidc();

    const nonce = generators.nonce();

    const tokenSet = await oidc.client.callback(context.OAUTH_REDIRECT_URI, {
      code: event.code,
      iss: event.iss,
    });

    console.log("received and validated tokens %j", tokenSet);
    console.log("validated ID Token claims %j", tokenSet.claims());

    // ***************************************************************************
    // GET USER INFO FROM OAUTH PROVIDER
    // ***************************************************************************
    let userInfo = await oidc.client.userinfo(tokenSet);
    console.log("Got user info", userInfo);
    console.log("Returning state", event.state);

    // ***************************************************************************
    // CONSTRUCT USER INFO FROM OAUTH
    // ***************************************************************************
    const user: Common.FlexUserType = {
      email: userInfo.email || userInfo.sub,
      full_name: userInfo.name || "OAuth User",
      image_url: userInfo.picture,
      roles: "agent,admin,supervisor",
    };

    // ***************************************************************************
    // Ingest the State Transfer to send back to the SP
    // ***************************************************************************
    if (!event.state)
      throw "OAUTH state not found, needed to reconstruct StateTransfer";
    const state: Common.StateTransfer = JSON.parse(
      decode(decodeURI(event.state))
    );
    console.log("Decoded state", state);

    const constructedRequestInfo = {
      extract: { request: { id: state.request_id } },
    };

    // ***************************************************************************
    // Create our SAML response
    // ***************************************************************************
    const {
      id,
      context: SAMLResponse,
      type,
    } = (await idp.createLoginResponse(
      sp,
      constructedRequestInfo,
      "post",
      user,
      createTemplateCallback(
        idp,
        sp,
        saml.Constants.namespace.binding.post,
        constructedRequestInfo.extract.request.id,
        user,
        context.ACCOUNT_SID
      ),
      true,
      state.RelayState
    )) as PostBindingContext;

    // ***************************************************************************
    // Get the ACS URL from metadata (!! Do not trust request ACS URL !!)
    // ***************************************************************************

    let spAcsUrl: string = "";

    // console.log("IDP/SSO: SP Meta:", sp.entityMeta.meta);
    if (Array.isArray(sp.entityMeta.meta.assertionConsumerService)) {
      // Get the Service Provide ACS URL from our pre-configured meta data (not from the request)
      spAcsUrl = sp.entityMeta.meta.assertionConsumerService.find(
        (e: Common.Binding) =>
          e.binding === saml.Constants.BindingNamespace.Post
      ).location;
    } else {
      spAcsUrl = sp.entityMeta.meta.assertionConsumerService.location;
    }

    if (!spAcsUrl && spAcsUrl == "")
      throw "SP ACS URL not configured, check SP metadata for POST binding";

    console.log("IDP/SSO: SP ACS URL:", spAcsUrl);

    // ***************************************************************************
    // Construct a simple web form to auto-submit SAML response
    // ***************************************************************************
    let loginForm = `
    <html>
      <body onload="document.forms[0].submit()">
        <form id="sso" method="post" action="${spAcsUrl}" autocomplete="off">
          <input type="hidden" name="SAMLResponse" id="resp" value="${SAMLResponse}" />
          <input type="hidden" name="RelayState" id="resp" value="${state.RelayState}" />
        </form>
      </body>
    </html>
    `;

    console.log("IDP/SSO: IDP Login Response", loginForm);
    response.setBody(loginForm);
    return callback(null, response);
  } catch (e) {
    console.error("[FATAL] OAuth error", e);
    response.setBody("OAuth error. " + e);
    response.setStatusCode(500);
  }

  return callback(null, response);
};
