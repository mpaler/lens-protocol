import '@nomiclabs/hardhat-ethers';
import { expect } from 'chai';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { ERRORS } from '../../helpers/errors';
import {
  approvalFollowModule,
  freeCollectAndTagModule,
  FIRST_PROFILE_ID,
  governance,
  lensHub,
  makeSuiteCleanRoom,
  MOCK_FOLLOW_NFT_URI,
  MOCK_PROFILE_HANDLE,
  MOCK_PROFILE_URI,
  MOCK_URI,
  user,
  userAddress,
  userTwo,
  userTwoAddress,
  abiCoder,
} from '../../__setup.spec';

let initData, data;
makeSuiteCleanRoom('Free Collect Module', function () {
  beforeEach(async function () {
    await expect(
      lensHub.createProfile({
        to: userAddress,
        handle: MOCK_PROFILE_HANDLE,
        imageURI: MOCK_PROFILE_URI,
        followModule: ZERO_ADDRESS,
        followModuleInitData: [],
        followNFTURI: MOCK_FOLLOW_NFT_URI,
      })
    ).to.not.be.reverted;
    await expect(
      lensHub.connect(governance).whitelistCollectModule(freeCollectAndTagModule.address, true)
    ).to.not.be.reverted;

    initData = abiCoder.encode(['bool', 'string[]'], [true, ['#love', '#hate']]);
    data = abiCoder.encode(['string[]'], [['#love', '#hate']]);
  });

  context('Negatives', function () {
    context('Collecting', function () {
      it('UserTwo should fail to collect without following without any follow module set', async function () {
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: freeCollectAndTagModule.address,
            collectModuleInitData: initData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)
        ).to.be.revertedWith(ERRORS.FOLLOW_INVALID);
      });

      it('UserTwo should mirror the original post, fail to collect from their mirror without following the original profile', async function () {
        await expect(
          lensHub.post({
            profileId: FIRST_PROFILE_ID,
            contentURI: MOCK_URI,
            collectModule: freeCollectAndTagModule.address,
            collectModuleInitData: initData,
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;
        const secondProfileId = FIRST_PROFILE_ID + 1;
        await expect(
          lensHub.connect(userTwo).createProfile({
            to: userTwoAddress,
            handle: 'usertwo',
            imageURI: MOCK_PROFILE_URI,
            followModule: ZERO_ADDRESS,
            followModuleInitData: [],
            followNFTURI: MOCK_FOLLOW_NFT_URI,
          })
        ).to.not.be.reverted;
        await expect(
          lensHub.connect(userTwo).mirror({
            profileId: secondProfileId,
            profileIdPointed: FIRST_PROFILE_ID,
            pubIdPointed: 1,
            referenceModuleData: [],
            referenceModule: ZERO_ADDRESS,
            referenceModuleInitData: [],
          })
        ).to.not.be.reverted;

        await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.be.revertedWith(
          ERRORS.FOLLOW_INVALID
        );
      });
    });
  });

  context('Scenarios', function () {
    it('User should post with the free collect module as the collect module and data, allowing non-followers to collect, user two collects without following', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectAndTagModule.address,
          collectModuleInitData: abiCoder.encode(['bool', 'string[]'], [false, ['#love', '#hate']]),
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
    });

    it('UserTwo should collect with success when following if the configuration only allows followers', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectAndTagModule.address,
          collectModuleInitData: initData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
    });

    it('UserTwo should collect with success when following according the follow module set', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectAndTagModule.address,
          collectModuleInitData: initData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      await expect(
        lensHub.connect(governance).whitelistFollowModule(approvalFollowModule.address, true)
      ).to.not.be.reverted;
      await expect(
        lensHub.setFollowModule(FIRST_PROFILE_ID, approvalFollowModule.address, [])
      ).to.not.be.reverted;
      await expect(
        approvalFollowModule.connect(user).approve(FIRST_PROFILE_ID, [userTwoAddress], [true])
      ).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(lensHub.connect(userTwo).collect(FIRST_PROFILE_ID, 1, data)).to.not.be.reverted;
    });

    it('UserTwo should mirror the original post, collect with success from their mirror when following the original profile which has no follow module set', async function () {
      await expect(
        lensHub.post({
          profileId: FIRST_PROFILE_ID,
          contentURI: MOCK_URI,
          collectModule: freeCollectAndTagModule.address,
          collectModuleInitData: initData,
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;
      const secondProfileId = FIRST_PROFILE_ID + 1;
      await expect(lensHub.connect(userTwo).follow([FIRST_PROFILE_ID], [[]])).to.not.be.reverted;
      await expect(
        lensHub.connect(userTwo).createProfile({
          to: userTwoAddress,
          handle: 'usertwo',
          imageURI: MOCK_PROFILE_URI,
          followModule: ZERO_ADDRESS,
          followModuleInitData: [],
          followNFTURI: MOCK_FOLLOW_NFT_URI,
        })
      ).to.not.be.reverted;
      await expect(
        lensHub.connect(userTwo).mirror({
          profileId: secondProfileId,
          profileIdPointed: FIRST_PROFILE_ID,
          pubIdPointed: 1,
          referenceModuleData: [],
          referenceModule: ZERO_ADDRESS,
          referenceModuleInitData: [],
        })
      ).to.not.be.reverted;

      await expect(lensHub.connect(userTwo).collect(secondProfileId, 1, data)).to.not.be.reverted;
    });
  });
});
