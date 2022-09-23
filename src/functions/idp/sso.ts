import "@twilio-labs/serverless-runtime-types";
import {
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import {
  sp,
  idp,
  createTemplateCallback,
  Binding,
  FlexUserType,
} from "../common";
import * as saml from "samlify";
import { PostBindingContext } from "samlify/types/src/entity";

type SSORequestEvent = {
  SAMLRequest?: string;
  RelayState?: string;
  SigAlg?: string;
  Signature?: string;
};

type SSORequestContext = {
  ACCOUNT_SID: string;
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
    // TODO: Call upstream database / OAuth provider
    // ***************************************************************************
    const user: FlexUserType = {
      email: "jonas@megatron.com",
      full_name: "Jonas Megatron",
      roles: "agent",
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
        extract.request.id,
        user,
        context.ACCOUNT_SID
      ),
      true,
      RelayState
    )) as PostBindingContext;

    // ***************************************************************************
    // Get the ACS URL from metadata (!! Do not trust request ACS URL !!)
    // ***************************************************************************

    let spAcsUrl: string = "";

    // console.log("IDP/SSO: SP Meta:", sp.entityMeta.meta);
    if (Array.isArray(sp.entityMeta.meta.assertionConsumerService)) {
      // Get the Service Provide ACS URL from our pre-configured meta data (not from the request)
      spAcsUrl = sp.entityMeta.meta.assertionConsumerService.find(
        (e: Binding) => e.binding === saml.Constants.BindingNamespace.Post
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
          <input type="hidden" name="RelayState" id="resp" value="${RelayState}" />
        </form>
      </body>
    </html>
    `;

    console.log("IDP/SSO: IDP Login Response", loginForm);
    response.setBody(loginForm);
    return callback(null, response);
  } catch (e) {
    // Possible errors: Ensure SP meta data has appropriate AssertionConsumerService binding(s)
    console.error("[FATAL] when parsing login response from IDP.", e);
    response.setHeaders({ location: "/" });
    response.setStatusCode(302);
  }

  return callback(null, response);
};
