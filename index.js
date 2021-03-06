var bip39 = require("bip39");
var hdkey = require('ethereumjs-wallet/hdkey');
var ProviderEngine = require("web3-provider-engine");
var FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js');
var HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var ProviderSubprovider = require("web3-provider-engine/subproviders/provider.js");
var Web3 = require("web3");
var Transaction = require('ethereumjs-tx');

function HDWalletProvider(mnemonics, provider_url, address_index=0, num_addresses=1) {
  if (!Array.isArray(mnemonics)) {
    mnemonics = [mnemonics];
  }
  this.mnemonics = mnemonics;
  this.hdwallets = [];
  this.mnemonics.forEach((mnemonic) => {
    if (typeof mnemonic == 'object') {
      let mnemonic_words = mnemonic.mnemonic;
      let password = mnemonic.password
      this.hdwallets.push(hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic_words, password)));
    } else {
      this.hdwallets.push(hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic)));
    }
  })

  this.wallet_hdpath = "m/44'/60'/0'/0/";
  this.wallets = {};
  this.addresses = [];
  this.walletsToAddresses = {}

  this.hdwallets.forEach((hdwallet, j) => {
    this.walletsToAddresses[j] = [];
    for (let i = address_index; i < address_index + num_addresses; i++) {
      var wallet = hdwallet.derivePath(this.wallet_hdpath + i).getWallet();
      var addr = '0x' + wallet.getAddress().toString('hex');
      this.addresses.push(addr);
      this.wallets[addr] = wallet;
      this.walletsToAddresses[j].push(addr);
    }
  })

  const tmp_accounts = this.addresses;
  const tmp_wallets = this.wallets;

  this.engine = new ProviderEngine();
  this.engine.addProvider(new HookedSubprovider({
    getAccounts: function(cb) { cb(null, tmp_accounts) },
    getPrivateKey: function(address, cb) {
      if (!tmp_wallets[address]) { return cb('Account not found'); }
      else { cb(null, tmp_wallets[address].getPrivateKey().toString('hex')); }
    },
    signTransaction: function(txParams, cb) {
      let pkey;
      if (tmp_wallets[txParams.from]) { pkey = tmp_wallets[txParams.from].getPrivateKey(); }
      else { cb('Account not found'); }
      var tx = new Transaction(txParams);
      tx.sign(pkey);
      var rawTx = '0x' + tx.serialize().toString('hex');
      cb(null, rawTx);
    }
  }));
  this.engine.addProvider(new FiltersSubprovider());
  this.engine.addProvider(new ProviderSubprovider(new Web3.providers.HttpProvider(provider_url)));
  this.engine.start(); // Required by the provider engine.
};

HDWalletProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

HDWalletProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

// returns the address of the given address_index, first checking the cache
HDWalletProvider.prototype.getAddress = function(address_index=0, wallet_index) {
  if (typeof wallet_index !== 'undefined') {
    return this.walletsToAddresses[wallet_index][address_index];
  } else {
    return this.addresses[address_index];
  }
}

// returns the addresses cache
HDWalletProvider.prototype.getAddresses = function(wallet_index) {
  if (typeof wallet_index !== 'undefined') {
    return this.walletsToAddresses[wallet_index];
  } else {
    return this.addresses;
  }
}

// add a new address
HDWalletProvider.prototype.addAddress = function(wallet_index=0) {
  var nAddresses = this.walletsToAddresses[wallet_index].length;
  var wallet = this.hdwallets[wallet_index].derivePath(this.wallet_hdpath + nAddresses).getWallet();
  var addr = '0x' + wallet.getAddress().toString('hex');
  this.addresses.push(addr);
  this.wallets[addr] = wallet;
  this.walletsToAddresses[wallet_index].push(addr);
  return addr;
}

module.exports = HDWalletProvider;
