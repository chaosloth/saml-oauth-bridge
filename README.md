# SAML OAUTH (OpenID Connect) Bridge in Twilio Serverless

A relatively simple SAML to OID (based on OAuth 2.0) bridge as a serverless project.

You might use if you had an application that only supports SAML and you wish to connect it to an IDP that only supports OpenID Connect. Note there are commercial solutions out there that do this as a service (e.g Auth0, MS AFDS, Okta, OneLogin, etc)

**_Features:_**

- ✅ Implements both SP and IDP
- ✅ SP may be configured from XML file
- ✅ IDP Metadata generated on the fly
- ✅ 100% server side and stateless
- ✅ Open Connect ID compliant

## Twilio Flex

Flex is a client that supports SAML for authentication, however the SP metadata endpoint is not exposed. Therefore the SP can be constructed with the following (see example sp.metadata.xml)

- ACS URL https://iam.twilio.com/v1/Accounts/ACxxxx/saml2
- Entity ID https://iam.twilio.com/v1/Accounts/ACxxxx/saml2/metadata

## Generating Certificates

To generate a new cert/key pair use the following command. Note unlike SSL/TLS these do not need to be signed by a CA
`openssl req -x509 -sha256 -nodes -days 365 -newkey rsa:2048 -keyout src/assets/new.idp.key.private.pem -out src/assets/new.idp.cert.private.pem`

## Configure the IDP

Set the following environment variables as appropriate for your deployment

| Variable                 | Purpose                                            | Example Value                      | Required |
| ------------------------ | -------------------------------------------------- | ---------------------------------- | -------- |
| IDP_ENTITY_ID            | SAML Entity identifier, should match domain        | http://localhost:3000/idp/metadata | yes      |
| IDP_CERT_FILE            | RSA Certificate FILE in PEM format                 | idp.cert.pem                       | yes      |
| IDP_PRIVATE_KEY_FILE     | RSA Key FILE in PEM format                         | idp.key.pem                        | yes      |
| IDP_PRIVATE_KEY_PASS     | Password string for the key file                   | ef987hwe98h3                       | no       |
| IDP_SSO_URL              | Where the SP should send SAML requests             | http://localhost:3000/idp/sso      | yes      |
| SAML_TMPL_LOGIN_RESPONSE | SAML response template, attributes to include etc. | saml.tmpl.login-response.xml       | yes      |

## Configure the Service Provider Settings

Minimum settings required to respond to Service Provider

| Variable             | Purpose                           | Example Value | Required |
| -------------------- | --------------------------------- | ------------- | -------- |
| SP_METADATA_XML_FILE | Minimum definition of expected SP | sp.twilio.xml | yes      |

Note: the meta data file may contain the SP public key etc for signature validation etc.

## Configure the OAUTH (Open ID Connect) Provider

Configure the OAUTH provider as per your authentication (client) settings

Note: This app will use the discovery protocol to retrieve details

| Variable            | Purpose                                             | Example Value                   | Required |
| ------------------- | --------------------------------------------------- | ------------------------------- | -------- |
| OAUTH_ISSUER_URI    | OAuth issuer endpoint                               | https://dev-xxxxx.us.auth0.com  | yes      |
| OAUTH_CLIENT_ID     | Registered client ID                                | weoinqpien13                    | yes      |
| OAUTH_CLIENT_SECRET | Client secret                                       | 09283f092j3f09                  | yes      |
| OAUTH_REDIRECT_URI  | Your URL endpoint where token/code will be returned | https://magic-spoon-123.twil.io | yes      |
| OAUTH_SCOPES        | Which scopes to request                             | openid email profile            | yes      |
| OAUTH_RESPONSE_MODE | Response mode (default is 'form')                   | form                            | no       |
| OAUTH_RESPONSE_TYPE | Response type (default is 'code')                   | id_token                        | no       |

# Debugging

Some tools that are useful

## IAM Showcase .com - unique URL login

Use a service like IAMShowcase.com to test IDP/SP flows
https://sptest.iamshowcase.com/ixs?idp=6f6881607c94119d87eb0d84dd13c284552a1cce

## SAML Test.id

Another great testing tool
