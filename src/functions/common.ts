import * as saml from "samlify";
import * as uuid from "uuid";
import {
  IdentityProviderConstructor,
  IdentityProviderSettings,
} from "samlify/types/src/types";
import { IdentityProvider } from "samlify/types/src/entity-idp";
import { ServiceProvider } from "samlify/types/src/entity-sp";
import { BindingNamespace } from "samlify/types/src/urn";

// ***************************************************
// DEFINE EXPECTED FLEX USER PROPS
// ***************************************************
export type FlexUserType = {
  email: string;
  full_name: string;
  roles: string;
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
  metadata: Runtime.getAssets()["/" + process.env.SP_METADATA_XML_FILE].open(),
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

  signingCert: Runtime.getAssets()["/" + process.env.IDP_CERT_FILE].open(),
  privateKey:
    Runtime.getAssets()["/" + process.env.IDP_PRIVATE_KEY_FILE].open(), // in .pem format
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
    context: Runtime.getAssets()
      ["/" + process.env.SAML_TMPL_LOGIN_RESPONSE].open()
      .trim(),
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

// ***************************************************
// START: KNOWN WORKING TEST WITH HTTP://SAMLTEST.ID
// export const idp: IdentityProviderConstructor =
//   saml.IdentityProvider({
//     metadata: Runtime.getAssets()["/" + process.env.IDP_METADATA_XML_FILE].open(), // metadata in xml format
//     isAssertionEncrypted: true,
//     messageSigningOrder: "encrypt-then-sign",
//   });
//
// export const sp = saml.ServiceProvider({
//   entityID: "http://localhost:3000/sp/metadata",
//   authnRequestsSigned: false,
//   wantAssertionsSigned: false,
//   wantMessageSigned: false,
//   wantLogoutResponseSigned: false,
//   wantLogoutRequestSigned: false,
//   signingCert: Runtime.getAssets()["/" + process.env.SP_CERT_FILE].open(),
//   privateKey: Runtime.getAssets()["/" + process.env.SP_PRIVATE_KEY_FILE].open(),
//   privateKeyPass: process.env.SP_PRIVATE_KEY_PASS,
//   encryptCert:
//     Runtime.getAssets()["/" + process.env.SP_ENCRYPT_CERT_FILE].open(),
//   encPrivateKey:
//     Runtime.getAssets()["/" + process.env.SP_ENCRYPT_KEY_FILE].open(),
//   // encPrivateKeyPass: process.env.SP_ENCRYPT_KEY_PASS,
//   isAssertionEncrypted: false,
//   assertionConsumerService: [
//     {
//       Binding: saml.Constants.BindingNamespace.Post,
//       Location: "http://localhost:3000/sp/acs",
//     },
//   ],
// });
// END: KNOWN WORKING WITH HTTP://SAMLTEST.ID
// ***************************************************

//
// ***************************************************
// EXAMPLE MODIFICATION OF SAML RESPONSE
// ***************************************************
// export const createTemplateCallback =
//   (
//     _idp: IdentityProvider,
//     _sp: ServiceProvider,
//     _binding: BindingNamespace,
//     user: any
//   ) =>
//   (template: any) => {
//     const _id = "_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6";
//     const now = new Date();
//     const spEntityID = _sp.entityMeta.getEntityID();
//     const idpSetting = _idp.entitySetting;
//     const fiveMinutesLater = new Date(now.getTime());
//     fiveMinutesLater.setMinutes(fiveMinutesLater.getMinutes() + 5);
//     const tvalue = {
//       ID: _id,
//       AssertionID: idpSetting.generateID
//         ? idpSetting.generateID()
//         : `${uuid.v4()}`,
//       Destination: _sp.entityMeta.getAssertionConsumerService(_binding),
//       Audience: spEntityID,
//       SubjectRecipient: spEntityID,
//       NameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
//       NameID: user.email,
//       Issuer: idp.entityMeta.getEntityID(),
//       IssueInstant: now.toISOString(),
//       ConditionsNotBefore: now.toISOString(),
//       ConditionsNotOnOrAfter: fiveMinutesLater.toISOString(),
//       SubjectConfirmationDataNotOnOrAfter: fiveMinutesLater.toISOString(),
//       AssertionConsumerServiceURL:
//         _sp.entityMeta.getAssertionConsumerService(_binding),
//       EntityID: spEntityID,
//       InResponseTo: "_4606cc1f427fa981e6ffd653ee8d6972fc5ce398c4",
//       StatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
//       attrUserEmail: "myemailassociatedwithsp@sp.com",
//       attrUserName: "mynameinsp",
//     };
//     return {
//       id: _id,
//       context: saml.SamlLib.replaceTagsByValue(template, tvalue),
//     };
//   };
