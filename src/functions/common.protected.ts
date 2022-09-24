import * as saml from "samlify";
import * as uuid from "uuid";
import { IdentityProviderConstructor } from "samlify/types/src/types";

import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

import { Issuer } from "openid-client";

// ***************************************************
// DEFINE EXPECTED FLEX USER PROPS
// ***************************************************
export type FlexUserType = {
  email: string;
  full_name: string;
  roles: string;
  image_url?: string;
  department?: string;
  location?: string;
  manager?: string;
  phone?: string;
  team_id?: string;
  team_name?: string;
  team_name_in_hierarchy?: string;
};

export type Binding = {
  binding: string;
  location: string;
};

export type StateTransfer = {
  request_id: string;
  RelayState: string;
};

// ***************************************************
// ASSET LOADER
// ***************************************************
export const loadAsset = (file: string | undefined) => {
  if (!file) throw "Attempted to load asset with undefined file name";
  try {
    return Runtime.getAssets()[`/${file}`].open().trim();
  } catch (e) {
    throw new Error(`File not found: /assets/${file}.`);
  }
};

// ***************************************************
// FIXME: THIS SKIPS VALIDATION
// ***************************************************
saml.setSchemaValidator({
  validate: (response) => {
    /* implement your own or always returns a resolved promise to skip */
    return Promise.resolve("skipped");
  },
});

// ***************************************************
// DEFINE OUR SP
// ***************************************************
export const sp = saml.ServiceProvider({
  metadata: loadAsset(process.env.SP_METADATA_XML_FILE),
  isAssertionEncrypted: false,
});
// export const sp = saml.ServiceProvider({ isAssertionEncrypted: false });

// ***************************************************
// CREATE OUR IDP
// ***************************************************
export const idp: IdentityProviderConstructor = saml.IdentityProvider({
  // metadata: Runtime.getAssets()["/" + process.env.IDP_METADATA_XML_FILE].open(), // metadata in xml format
  entityID: process.env.IDP_ENTITY_ID,
  isAssertionEncrypted: false,

  signingCert: loadAsset(process.env.IDP_CERT_FILE),
  privateKey: loadAsset(process.env.IDP_PRIVATE_KEY_FILE), // in .pem format
  privateKeyPass: process.env.IDP_PRIVATE_KEY_PASS || "", // optional if your key file is not protected
  // encryptCert:
  //   Runtime.getAssets()["/" + process.env.IDP_ENCRYPT_CERT_FILE].open(), // in .pem format
  // encPrivateKey:
  //   Runtime.getAssets()["/" + process.env.IDP_ENCRYPT_KEY_FILE].open(),
  // encPrivateKeyPass: process.env.IDP_ENCRYPT_KEY_PASS,
  // messageSigningOrder: "encrypt-then-sign",
  singleSignOnService: [
    {
      Binding: saml.Constants.BindingNamespace.Post,
      Location: process.env.IDP_SSO_URL ? process.env.IDP_SSO_URL : "/idp/sso",
    },
    {
      Binding: saml.Constants.BindingNamespace.Redirect,
      Location: process.env.IDP_SSO_URL ? process.env.IDP_SSO_URL : "/idp/sso",
    },
  ],
  nameIDFormat: [saml.Constants.namespace.format.emailAddress],
  loginResponseTemplate: {
    context: loadAsset(process.env.SAML_TMPL_LOGIN_RESPONSE).trim(),
  },
});

// ***************************************************
// CREATE SAML PROPS FROM FLEX USER
// ***************************************************
export const createFlexAttributes = (user: FlexUserType) => {
  let attributeTemplate = `<saml2:Attribute Name="{attributeName}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">
        <saml2:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:{attributeType}">{attributeValue}</saml2:AttributeValue>
      </saml2:Attribute>
    `;

  let samlAttributes: string = "";
  Object.keys(user).map((key) => {
    samlAttributes += saml.SamlLib.replaceTagsByValue(attributeTemplate, {
      attributeName: key,
      attributeValue: user[key as keyof FlexUserType],
      attributeType: typeof user[key as keyof FlexUserType],
    });
  });
  return samlAttributes;
};

// ***************************************************
// CUSTOMISE SAML RESPONSE FUNCTION
// ***************************************************
export const createTemplateCallback =
  (
    _idp: any,
    _sp: any,
    _binding: any,
    requestId: string,
    user: FlexUserType,
    ACCOUNT_SID: string
  ) =>
  (template: any) => {
    const _id = "twilio_" + uuid.v4().replace(/-/g, "").substring(0, 10);
    const now = new Date();
    const spEntityID = _sp.entityMeta.getEntityID();
    const idpEntityID = _idp.entityMeta.getEntityID();
    const idpSetting = _idp.entitySetting;
    const fiveMinutesLater = new Date(now.getTime());
    fiveMinutesLater.setMinutes(fiveMinutesLater.getMinutes() + 5);
    const fiveMinutesAgo = new Date(now.getTime());
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const flexAttributes = createFlexAttributes(user);

    const tagValues = {
      ID: _id,
      AssertionID: idpSetting.generateID
        ? idpSetting.generateID()
        : `${uuid.v4()}`,
      Destination: _sp.entityMeta.getAssertionConsumerService(_binding), // https://iam.twilio.com/v1/Accounts/ACXXXXXXXXXXXXXXXXXXXXX/saml2
      Audience: spEntityID,
      SubjectRecipient: spEntityID,
      NameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",

      NameID: user.email,
      Issuer: idpEntityID,
      IssueInstant: now.toISOString(),
      ConditionsNotBefore: fiveMinutesAgo.toISOString(),
      ConditionsNotOnOrAfter: fiveMinutesLater.toISOString(),
      SubjectConfirmationDataNotOnOrAfter: fiveMinutesLater.toISOString(),
      AssertionConsumerServiceURL:
        _sp.entityMeta.getAssertionConsumerService(_binding),
      EntityID: spEntityID,
      InResponseTo: requestId,
      StatusCode: saml.Constants.StatusCode.Success,
      attrUserEmail: user.email,
      attrUserName: user.email,
      ACCOUNT_SID,
      full_name: user.full_name,
      flexAttributes,
    };

    return {
      id: _id,
      context: saml.SamlLib.replaceTagsByValue(template, tagValues),
    };
  };

export const handler: ServerlessFunctionSignature = async function (
  context: Context,
  event: {},
  callback: ServerlessCallback
) {
  return callback(null, "Nothing to see here,  move along");
};

// ***************************************************
// DEFINE OIDC CLIENT
// ***************************************************
export const Oidc = async () => {
  if (!process.env.OAUTH_ISSUER_URI || process.env.OAUTH_ISSUER_URI == "")
    throw "Issuer not configured in .env";
  const issuer = await Issuer.discover(process.env.OAUTH_ISSUER_URI);
  // console.log("Discovered issuer %s %O", issuer.issuer, issuer.metadata);
  console.log("Discovered issuer %s", issuer.issuer);

  if (!process.env.OAUTH_CLIENT_ID || process.env.OAUTH_CLIENT_ID == "")
    throw "OAUTH_CLIENT_ID not configured in .env";
  const client = new issuer.Client({
    client_id: process.env.OAUTH_CLIENT_ID,
    client_secret: process.env.OAUTH_CLIENT_SECRET,
    redirect_uris: process.env.OAUTH_REDIRECT_URI
      ? process.env.OAUTH_REDIRECT_URI.split(" ")
      : [],
    response_types: process.env.OAUTH_RESPONSE_TYPES
      ? process.env.OAUTH_RESPONSE_TYPES.split(" ")
      : [],
  });

  return { issuer, client };
};

// ***************************************************
// HELPER METHODS
// ***************************************************
export const decode = (str: string): string =>
  Buffer.from(str, "base64").toString("binary");

export const encode = (str: string): string =>
  Buffer.from(str, "binary").toString("base64");
