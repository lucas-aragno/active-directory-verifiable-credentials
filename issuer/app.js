// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

////////////// Node packages
var http = require('http');
var fs = require('fs');
var path = require('path');
var express = require('express')
var session = require('express-session')
var bodyParser = require('body-parser')
var base64url = require('base64url')
var secureRandom = require('secure-random');

//////////////// Verifiable Credential SDK
var { CryptoBuilder, 
      LongFormDid, 
      RequestorBuilder, 
      ValidatorBuilder
    } = require('verifiablecredentials-verification-sdk-typescript');

/////////// OpenID Connect Client Registration
const client = {
  client_name: 'Sample Issuer',
  logo_uri: 'https://storagebeta.blob.core.windows.net/static/ninja-icon.png',
  tos_uri: 'https://www.microsoft.com/servicesagreement',
  client_purpose: 'So you can prove you know how to use verifiable credentials.'
}

/////////// Verifiable Credential configuration values
const credential = 'https://portableidentitycards.azure-api.net/v1.0/9c59be8b-bd18-45d9-b9d9-082bc07c094f/portableIdentities/contracts/Ninja%20Card';
const credentialType = 'VerifiedCredentialNinja';
const issuerDid = 'did:ion:EiDp6Ye7hdwR-KkLJfM-xTkyla6mKDSvekWGKeV1BaO5hw?-ion-initial-state=eyJkZWx0YV9oYXNoIjoiRWlCNUN0OVIwdmJCSXJ4VV8tNmtOX2pRam4xRkxselAydHFKTXpFMHZQSjMxdyIsInJlY292ZXJ5X2tleSI6eyJrdHkiOiJFQyIsImNydiI6InNlY3AyNTZrMSIsIngiOiJGOHpHSVBuaE5RM1YzbVZpSnlNeVI3RFJ1ei1PWE93Y2hrd2t5RHU1U0RRIiwieSI6InVxc1dEZURpaDBLQ1R2a1Iyal9TZWkwdUZOQ29xVE5tSGRwNlVNMXNrUjgifSwicmVjb3ZlcnlfY29tbWl0bWVudCI6IkVpQUFiZHo2YzlmcjhsODFma1FRa29sVEswY2o2Z0JhSThnd3h6SUowTWxoU0EifQ.eyJ1cGRhdGVfY29tbWl0bWVudCI6IkVpQ0thbXE2NFpjYVdtR2xjUlIwc1k2Qk43Tm5iSWV1cmQyMmV4UDM2akpVVWciLCJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljS2V5cyI6W3siaWQiOiJzaWdfNWVkNTc1ZmIiLCJ0eXBlIjoiRWNkc2FTZWNwMjU2azFWZXJpZmljYXRpb25LZXkyMDE5IiwiandrIjp7Imt0eSI6IkVDIiwiY3J2Ijoic2VjcDI1NmsxIiwieCI6Ilo4YWlENlUzMy1DVm1aU0lBejAxdGVBV3NvRnE2SmlVZGxpYVB3MlkxeWsiLCJ5IjoiUC02U3BSdXhkdjZQQmR6QS13WTJuRVVVdFd0QzU1c3kxUUlfcVpvNkNjYyJ9LCJ1c2FnZSI6WyJvcHMiLCJhdXRoIiwiZ2VuZXJhbCJdfV19fV19';

/////////// Load credentials for issuer organization from Key Vault
// TODO: Update this sample to use Key Vault when bug is fixed

/////////// Load credentials for issuer organization from file
// TODO: Update this sample to use same long form DID on every app start

////////// Generate a new ION long form DID to be used by this website
const did = '';
const signingKeyReference = 'sign';
const crypto = new CryptoBuilder(did, signingKeyReference).build();
(async () => {
  const longForm = new LongFormDid(crypto);
  const longFormDid = await longForm.create(signingKeyReference);
  crypto.builder.did = longFormDid;
})();

//////////// Main Express server function
// Note: You'll want to update the hostname and port values for your setup.
const app = express()
const port = 8081
const host = 'https://3e2930a3fd96.ngrok.io'

// Serve static files out of the /public directory
app.use(express.static('public'))

// Set up a simple server side session store.
// The session store will briefly cache issuance requests
// to facilitate QR code scanning.
var sessionStore = new session.MemoryStore();
app.use(session({
  secret: 'cookie-secret-key',
  resave: false,
  saveUninitialized: true,
  store: sessionStore
}))

// Serve index.html as the home page
app.get('/', function (req, res) { 
  res.sendFile('public/index.html', {root: __dirname})
})

// Generate an issuance request, cache it on the server,
// and return a reference to the issuance reqeust. The reference
// will be displayed to the user on the client side as a QR code.
app.get('/issue-request', async (req, res) => {

  // Construct a request to issue a verifiable credential 
  // using the verifiable credential issuer service
  const state = base64url.encode(Buffer.from(secureRandom.randomUint8Array(10)));
  const nonce = base64url.encode(Buffer.from(secureRandom.randomUint8Array(10)));
  const clientId = `${host}/issue-response`;

  const requestBuilder = new RequestorBuilder({
    crypto: crypto,
    clientName: client.client_name,
    clientId: clientId,
    redirectUri: clientId,
    logoUri: client.logo_uri,
    tosUri: client.tos_uri,
    client_purpose: client.client_purpose,
    attestation: {
      presentations: [
        { 
          credentialType: credentialType, 
          contracts: [credential], 
          required: true
        }
      ]
    }
  }).useNonce(nonce)
    .useState(state)
    .allowIssuance(true);

  // Cache the issue request on the server
  req.session.issueRequest = await requestBuilder.build().create();
  
  // Return a reference to the issue request that can be encoded as a QR code
  var requestUri = encodeURIComponent(`${host}/issue-request.jwt?id=${req.session.id}`);
  var issueRequestReference = 'verifiablecredential://?request_uri=' + requestUri + '&client_id=' +  clientId;
  res.send(issueRequestReference);

})


// When the QR code is scanned, Authenticator will dereference the
// issue request to this URL. This route simply returns the cached
// issue request to Authenticator.
app.get('/issue-request.jwt', async (req, res) => {

  // Look up the issue reqeust by session ID
  sessionStore.get(req.query.id, (error, session) => {
    res.send(session.issueRequest.request);
  })

})


// Once the Verifiable Credential has been successfully issued,
// Authenticator will present the credential back to this server
// at this URL. We can verify the credential and extract its contents
// if we wish.
var parser = bodyParser.urlencoded({ extended: false });
app.post('/issue-response', parser, async (req, res) => {

  const clientId = `${host}/issue-response`

    // Validate the credential presentation and extract the credential's attributes.
    // If this check succeeds, the user is a Verified Credential Ninja.
    // Log a message to the console indicating successful verification of the credential.
    const validator = new ValidatorBuilder(crypto)
      .useTrustedIssuersForVerifiableCredentials({[credentialType]: [issuerDid]})
      .useAudienceUrl(clientId)
      .build();

    const validationResult = await validator.validate(req.body.id_token);
    
    if (!validationResult.result) {
        console.error(`Validation failed: ${validationResult.detailedError}`);
        return res.send()
    }

    var issuedCredential = validationResult.validationResult.verifiableCredentials[credentialType].decodedToken;
    console.log(`Successfully issued Verified Credential Ninja card to ${issuedCredential.vc.credentialSubject.firstName} ${issuedCredential.vc.credentialSubject.lastName}.`);
    res.send();
})

// start server
app.listen(port, () => console.log(`Example app listening on port ${port}!`))
