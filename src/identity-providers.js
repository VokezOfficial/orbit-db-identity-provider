'use strict'
const Identity = require('./identity')
const OrbitDBIdentityProvider = require('./orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')

let supportedTypes = {
  'orbitdb': OrbitDBIdentityProvider,
}

const getHandlerFor = (type) => {
  if (!IdentityProviders.isSupported(type)) {
    throw new Error(`IdentityProvider type '${type}' is not supported`)
  }
  return supportedTypes[type]
}

class IdentityProviders {
  constructor(options = {}) {
    this._keystore = options.keystore || Keystore.create(options.keypath || './orbitdb/ipkeys')
  }

  async sign (identity, data) {
    const signingKey = await this._keystore.getKey(identity.id)
    if (!signingKey)
      throw new Error(`Private signing key not found from Keystore`)

    const signature = await this._keystore.sign(signingKey, data)
    return signature
  }

  async verify (signature, publicKey, data) {
    return this._keystore.verify(signature, publicKey, data)
  }

  async create(id, options = {}) {
    const { publicKey, idSignature, selfSignedPubKeyIdSig } = await this.signIdentity(id, options)
    const IdentityProvider = getHandlerFor(options.type)
    const pubKeyIdSignature = await IdentityProvider.signIdentity(publicKey + idSignature, options) || selfSignedPubKeyIdSig
    return new Identity(id, publicKey, idSignature, pubKeyIdSignature, IdentityProvider.type || type, this)
  }

  async signIdentity(id, options = {}) {
    const keystore = options.keystore || this._keystore
    const key = await keystore.getKey(id) || await keystore.createKey(id)
    const publicKey = await key.getPublic('hex')
    const idSignature = await keystore.sign(key, id)
    const selfSignedPubKeyIdSig = await keystore.sign(key, publicKey + idSignature)
    return { publicKey, idSignature, selfSignedPubKeyIdSig }
  }

  async verifyIdentity (identity, options = {}) {
    const verified = await this._keystore.verify(
      identity.signatures.id,
      identity.publicKey,
      identity.id
    )

    return verified && await IdentityProviders.verifyIdentity(identity, options)
  }

  static async verifyIdentity(identity, options = {}) {
    const IdentityProvider = getHandlerFor(identity.type)
    return await IdentityProvider.verifyIdentity(identity, options)
  }

  static async createIdentity (id, options = {}) {
    const identityProvider = new IdentityProviders(options)
    options = Object.assign({}, { type: 'orbitdb' }, options)
    return await identityProvider.create(id, options)
  }
  
  static isSupported (type) {
    return Object.keys(supportedTypes).includes(type)
  }

  static addIdentityProvider (IdentityProvider) {
    if (!IdentityProvider) {
      throw new Error('IdentityProvider class needs to be given as an option')
    }

    if (!IdentityProvider.type ||
      typeof IdentityProvider.type !== 'string') {
      throw new Error('Given IdentityProvider class needs to implement: static get type() { /* return a string */}.')
    }

    supportedTypes[IdentityProvider.type] = IdentityProvider
  }

  static removeIdentityProvider (type) {
    delete supportedTypes[type]
  }
}

module.exports = IdentityProviders