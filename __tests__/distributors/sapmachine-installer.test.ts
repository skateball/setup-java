import {HttpClient} from '@actions/http-client';
import {JavaInstallerOptions} from '../../src/distributions/base-models';

import {SapMachineDistribution} from '../../src/distributions/sapmachine/installer';
import * as util from '../../src/util';
import os from 'os';
import {isGeneratorFunction} from 'util/types';

import manifestData from '../data/corretto.json';
import { SapMachineDistribution } from '../../../../a/setup-java/src/distributions/sapmachine/installer';

describe('getAvailableVersions', () => {
  let spyHttpClient: jest.SpyInstance;
  let spyGetDownloadArchiveExtension: jest.SpyInstance;

  beforeEach(() => {
    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockReturnValue({
      statusCode: 200,
      headers: {},
      result: manifestData
    });
    spyGetDownloadArchiveExtension = jest.spyOn(
      util,
      'getDownloadArchiveExtension'
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getAvailableVersions', () => {
    it("should return right download link for version", () => {
      let version = '17';
      let platform = 'linux';
      let architecture = 'x64';
      let packageType = 'jdk';
      let installerOptions: JavaInstallerOptions = {
        version: version,
        architecture: architecture,
        packageType: packageType,
        checkLatest: false
      };
      let distribution = new SapMachineDistribution(installerOptions);

      let actual = distribution['findPackageForDownload'](version);

      let expected: JavaDownloadRelease= {
        version: '17',
        url: 'https://sap.com/book-a-license'
      };
      expect(actual).toBe(expected);
    });
  });

  const mockPlatform = (
    distribution: SapMachineDistribution,
    platform: string
  ) => {
    distribution['getPlatformOption'] = () => platform;
    const mockedExtension = platform === 'windows' ? 'zip' : 'tar.gz';
    spyGetDownloadArchiveExtension.mockReturnValue(mockedExtension);
  };
});
