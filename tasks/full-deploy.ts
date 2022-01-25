import '@nomiclabs/hardhat-ethers';
import { hexlify, keccak256, RLP } from 'ethers/lib/utils';
import fs from 'fs';
import { task } from 'hardhat/config';
import {
  LensHub__factory,
  ApprovalFollowModule__factory,
  CollectNFT__factory,
  Currency__factory,
  EmptyCollectModule__factory,
  FeeCollectModule__factory,
  FeeFollowModule__factory,
  FollowerOnlyReferenceModule__factory,
  FollowNFT__factory,
  InteractionLogic__factory,
  LimitedFeeCollectModule__factory,
  LimitedTimedFeeCollectModule__factory,
  ModuleGlobals__factory,
  PublishingLogic__factory,
  RevertCollectModule__factory,
  TimedFeeCollectModule__factory,
  TransparentUpgradeableProxy__factory,
} from '../typechain-types';
import { deployContract, waitForTx } from './helpers/utils';

const TREASURY_FEE_BPS = 50;
const LENS_HUB_NFT_NAME = 'Various Vegetables';
const LENS_HUB_NFT_SYMBOL = 'VVGT';

task('full-deploy', 'deploys the entire Lens protocol').setAction(async ({}, hre) => {
  // Note that the use of these signers is a placeholder and is not meant to be used in
  // production.
  const ethers = hre.ethers;
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];
  const governance = accounts[1];
  const deployerAddress = deployer.address;
  const governanceAddress = governance.address;
  const treasuryAddress = accounts[2].address;

  const moduleGlobals = await new ModuleGlobals__factory(deployer).deploy(
    governanceAddress,
    treasuryAddress,
    TREASURY_FEE_BPS
  );

  console.log('\n\t-- Deploying Logic Libs --');

  const publishingLogic = await deployContract(new PublishingLogic__factory(deployer).deploy());
  const interactionLogic = await deployContract(new InteractionLogic__factory(deployer).deploy());
  const hubLibs = {
    'contracts/libraries/PublishingLogic.sol:PublishingLogic': publishingLogic.address,
    'contracts/libraries/InteractionLogic.sol:InteractionLogic': interactionLogic.address,
  };

  // Here, we pre-compute the nonces and addresses used to deploy the contracts.
  const nonce = await deployer.getTransactionCount();
  const followNFTNonce = hexlify(nonce + 1);
  const collectNFTNonce = hexlify(nonce + 2);
  const hubProxyNonce = hexlify(nonce + 3);

  const followNFTImplAddress =
    '0x' + keccak256(RLP.encode([deployerAddress, followNFTNonce])).substr(26);
  const collectNFTImplAddress =
    '0x' + keccak256(RLP.encode([deployerAddress, collectNFTNonce])).substr(26);
  const hubProxyAddress = '0x' + keccak256(RLP.encode([deployerAddress, hubProxyNonce])).substr(26);

  // Next, we deploy first the hub implementation, then the followNFT implementation, the collectNFT, and finally the
  // hub proxy with initialization.
  console.log('\n\t-- Deploying Hub Implementation --');

  const lensHubImpl = await deployContract(
    new LensHub__factory(hubLibs, deployer).deploy(followNFTImplAddress, collectNFTImplAddress)
  );

  console.log('\n\t-- Deploying Follow & Collect NFT Implementations --');
  await deployContract(new FollowNFT__factory(deployer).deploy(hubProxyAddress));
  await deployContract(new CollectNFT__factory(deployer).deploy(hubProxyAddress));

  let data = lensHubImpl.interface.encodeFunctionData('initialize', [
    LENS_HUB_NFT_NAME,
    LENS_HUB_NFT_SYMBOL,
    governanceAddress,
  ]);

  console.log('\n\t-- Deploying Hub Proxy --');

  let proxy = await deployContract(
    new TransparentUpgradeableProxy__factory(deployer).deploy(
      lensHubImpl.address,
      deployerAddress,
      data
    )
  );

  // Connect the hub proxy to the LensHub factory and the governance for ease of use.
  const lensHub = LensHub__factory.connect(proxy.address, governance);

  // Currency
  console.log('\n\t-- Deploying Currency --');
  const currency = await deployContract(new Currency__factory(deployer).deploy());

  // Deploy collect modules
  console.log('\n\t-- Deploying feeCollectModule --');
  const feeCollectModule = await deployContract(
    new FeeCollectModule__factory(deployer).deploy(lensHub.address, moduleGlobals.address)
  );
  console.log('\n\t-- Deploying limitedFeeCollectModule --');
  const limitedFeeCollectModule = await deployContract(
    new LimitedFeeCollectModule__factory(deployer).deploy(lensHub.address, moduleGlobals.address)
  );
  console.log('\n\t-- Deploying timedFeeCollectModule --');
  const timedFeeCollectModule = await deployContract(
    new TimedFeeCollectModule__factory(deployer).deploy(lensHub.address, moduleGlobals.address)
  );
  console.log('\n\t-- Deploying limitedTimedFeeCollectModule --');
  const limitedTimedFeeCollectModule = await deployContract(
    new LimitedTimedFeeCollectModule__factory(deployer).deploy(
      lensHub.address,
      moduleGlobals.address
    )
  );

  console.log('\n\t-- Deploying revertCollectModule --');
  const revertCollectModule = await deployContract(
    new RevertCollectModule__factory(deployer).deploy()
  );
  console.log('\n\t-- Deploying emptyCollectModule --');
  const emptyCollectModule = await deployContract(
    new EmptyCollectModule__factory(deployer).deploy(lensHub.address)
  );

  // Deploy follow modules
  console.log('\n\t-- Deploying feeFollowModule --');
  const feeFollowModule = await deployContract(
    new FeeFollowModule__factory(deployer).deploy(lensHub.address, moduleGlobals.address)
  );
  console.log('\n\t-- Deploying approvalFollowModule --');
  const approvalFollowModule = await deployContract(
    new ApprovalFollowModule__factory(deployer).deploy(lensHub.address)
  );

  // Deploy reference module
  console.log('\n\t-- Deploying followerOnlyReferenceModule --');
  const followerOnlyReferenceModule = await deployContract(
    new FollowerOnlyReferenceModule__factory(deployer).deploy(lensHub.address)
  );

  // Whitelist the collect modules
  console.log('\n\t-- Whitelisting Collect Modules --');
  await waitForTx(lensHub.whitelistCollectModule(feeCollectModule.address, true));
  await waitForTx(lensHub.whitelistCollectModule(limitedFeeCollectModule.address, true));
  await waitForTx(lensHub.whitelistCollectModule(timedFeeCollectModule.address, true));
  await waitForTx(lensHub.whitelistCollectModule(limitedTimedFeeCollectModule.address, true));
  await waitForTx(lensHub.whitelistCollectModule(revertCollectModule.address, true));
  await waitForTx(lensHub.whitelistCollectModule(emptyCollectModule.address, true));

  // Whitelist the follow modules
  console.log('\n\t-- Whitelisting Follow Modules --');
  await waitForTx(lensHub.whitelistFollowModule(feeFollowModule.address, true));
  await waitForTx(lensHub.whitelistFollowModule(approvalFollowModule.address, true));

  // Whitelist the reference module
  console.log('\n\t-- Whitelisting Reference Module --');
  await waitForTx(lensHub.whitelistReferenceModule(followerOnlyReferenceModule.address, true));

  // Whitelist the currency
  console.log('\n\t-- Whitelisting Currency in Module Globals --');
  await waitForTx(moduleGlobals.connect(governance).whitelistCurrency(currency.address, true));

  // Save and log the addresses
  const addrs = {
    'lensHub proxy': lensHub.address,
    'lensHub impl:': lensHubImpl.address,
    'publishing logic lib': publishingLogic.address,
    'interaction logic lib': interactionLogic.address,
    'follow NFT impl': followNFTImplAddress,
    'collect NFT impl': collectNFTImplAddress,
    currency: currency.address,
    'module globals': moduleGlobals.address,
    'fee collect module': feeCollectModule.address,
    'limited fee collect module': limitedFeeCollectModule.address,
    'timed fee collect module': timedFeeCollectModule.address,
    'limited timed fee collect module': limitedTimedFeeCollectModule.address,
    'revert collect module': revertCollectModule.address,
    'empty collect module': emptyCollectModule.address,
    'fee follow module': feeFollowModule.address,
    'approval follow module': approvalFollowModule.address,
    'follower only reference module': followerOnlyReferenceModule.address,
  };
  const json = JSON.stringify(addrs, null, 2);
  console.log(json);

  fs.writeFileSync('addresses.json', json, 'utf-8');
});
