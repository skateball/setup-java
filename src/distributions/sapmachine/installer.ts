import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import semver from 'semver';

import fs from 'fs';
import path from 'path';

import {JavaBase} from '../base-installer';
import {
  convertVersionToSemver,
  extractJdkFile,
  getDownloadArchiveExtension,
  getGitHubHttpHeaders,
  isVersionSatisfies
} from '../../util';
import {ISapMachinelVersions, ISapMachineAllVersions} from './models';
import {
  JavaDownloadRelease,
  JavaInstallerOptions,
  JavaInstallerResults
} from '../base-models';

export class SapMachineDistribution extends JavaBase {
  constructor(installerOptions: JavaInstallerOptions) {
    super('SapMachine', installerOptions);
  }

  protected async findPackageForDownload(
    version: string
  ): Promise<JavaDownloadRelease> {
    /*if (!this.stable) {
      throw new Error('Early access versions are not supported by Dragonwell');
    }

    if (this.packageType !== 'jdk') {
      throw new Error('Dragonwell provides only the `jdk` package type');
    }*/

    const availableVersions = await this.getAvailableVersions();

    const matchedVersions = availableVersions
      .filter(item => {
        return isVersionSatisfies(version, item.jdk_version);
      })
      .map(item => {
        return {
          version: item.jdk_version,
          url: item.download_link
        } as JavaDownloadRelease;
      });

    if (!matchedVersions.length) {
      throw new Error(
        `Couldn't find any satisfied version for the specified java-version: "${version}" and architecture: "${this.architecture}".`
      );
    }

    const resolvedVersion = matchedVersions[0];
    return resolvedVersion;
  }

  private async getAvailableVersions(): Promise<ISapMachinelVersions[]> {
    const platform = this.getPlatformOption();
    const arch = this.distributionArchitecture();

    let fetchedDragonwellJson = await this.fetchJsonFromPrimaryUrl();

    if (!fetchedDragonwellJson) {
      fetchedDragonwellJson = await this.fetchJsonFromBackupUrl();
    }

    if (!fetchedDragonwellJson) {
      throw new Error(
        `Couldn't fetch Dragonwell versions information from both primary and backup urls`
      );
    }

    core.debug(
      'Successfully fetched information about available Dragonwell versions'
    );

    const availableVersions = this.parseVersions(
      platform,
      arch,
      fetchedDragonwellJson
    );

    if (core.isDebug()) {
      core.startGroup('Print information about available versions');
      core.debug(availableVersions.map(item => item.jdk_version).join(', '));
      core.endGroup();
    }

    return availableVersions;
  }

  protected async downloadTool(
    javaRelease: JavaDownloadRelease
  ): Promise<JavaInstallerResults> {
    core.info(
      `Downloading Java ${javaRelease.version} (${this.distribution}) from ${javaRelease.url} ...`
    );
    const javaArchivePath = await tc.downloadTool(javaRelease.url);

    core.info(`Extracting Java archive...`);

    const extractedJavaPath = await extractJdkFile(
      javaArchivePath,
      getDownloadArchiveExtension()
    );

    const archiveName = fs.readdirSync(extractedJavaPath)[0];
    const archivePath = path.join(extractedJavaPath, archiveName);
    const version = this.getToolcacheVersionName(javaRelease.version);

    const javaPath = await tc.cacheDir(
      archivePath,
      this.toolcacheFolderName,
      version,
      this.architecture
    );

    return {version: javaRelease.version, path: javaPath};
  }

  private parseVersions(
    platform: string,
    arch: string,
    versions: ISapMachineAllVersions
  ): ISapMachinelVersions[] {
    const eligibleVersions: ISapMachinelVersions[] = [];

    for (const majorVersion in versions) {
      const majorVersionMap = versions[majorVersion];
      for (let jdkVersion in majorVersionMap.updates) {
        const jdkVersionMap = majorVersionMap[jdkVersion];
        if (!(platform in jdkVersionMap)) {
          continue;
        }
        const platformMap = jdkVersionMap[platform];
        if (!(arch in platformMap)) {
          continue;
        }
        const archMap = platformMap[arch];

        if (jdkVersion === 'latest') {
          continue;
        }

        // Some version of Dragonwell JDK are numerated with help of non-semver notation (more then 3 digits).
        // Common practice is to transform excess digits to the so-called semver build part, which is prefixed with the plus sign, to be able to operate with them using semver tools.
        if (jdkVersion.split('.').length > 3) {
          jdkVersion = convertVersionToSemver(jdkVersion);
        }

        for (const edition in archMap) {
          eligibleVersions.push({
            os: platform,
            architecture: arch,
            jdk_version: jdkVersion,
            checksum: archMap[edition].sha256 ?? '',
            download_link: archMap[edition].download_url,
            edition: edition,
            image_type: 'jdk'
          });
          break; // Get the first available link to the JDK. In most cases it should point to the Extended version of JDK, in rare cases like with v17 it points to the Standard version (the only available).
        }
      }
    }

    const sortedVersions = this.sortParsedVersions(eligibleVersions);

    return sortedVersions;
  }

  // Sorts versions in descending order as by default data in JSON isn't sorted
  private sortParsedVersions(
    eligibleVersions: IDragonwellVersions[]
  ): IDragonwellVersions[] {
    const sortedVersions = eligibleVersions.sort((versionObj1, versionObj2) => {
      const version1 = versionObj1.jdk_version;
      const version2 = versionObj2.jdk_version;
      return semver.compareBuild(version1, version2);
    });
    return sortedVersions.reverse();
  }

  private getPlatformOption(): string {
    switch (process.platform) {
      case 'win32':
        return 'windows';
      default:
        return process.platform;
    }
  }

  private async fetchJsonFromPrimaryUrl(): Promise<ISapMachineAllVersions | null> {
    const primaryUrl = 'https://sap.github.io/SapMachine/assets/data/sapmachine-releases-all.json';
    try {
      core.debug(
        `Trying to fetch available SapMachine versions info from the primary url: ${primaryUrl}`
      );
      const releases = (
        await this.http.getJson<ISapMachineAllVersions>(primaryUrl)
      ).result;
      return releases;
    } catch (err) {
      core.debug(
        `Fetching SapMachine versions info from the primary link: ${primaryUrl} ended up with the error: ${
          (err as Error).message
        }`
      );
      return null;
    }
  }

  private async fetchJsonFromBackupUrl(): Promise<IDragonwellAllVersions | null> {
    const owner = 'dragonwell-releng';
    const repository = 'dragonwell-setup-java';
    const branch = 'main';
    const filePath = 'releases.json';

    const backupUrl = `https://api.github.com/repos/${owner}/${repository}/contents/${filePath}?ref=${branch}`;

    const headers = getGitHubHttpHeaders();

    try {
      core.debug(
        `Trying to fetch available Dragonwell versions info from the backup url: ${backupUrl}`
      );
      const fetchedDragonwellJson = (
        await this.http.getJson<IDragonwellAllVersions>(backupUrl, headers)
      ).result;
      return fetchedDragonwellJson;
    } catch (err) {
      core.debug(
        `Fetching Dragonwell versions info from the backup url: ${backupUrl} ended up with the error: ${
          (err as Error).message
        }`
      );
      return null;
    }
  }
}
