export interface ISapMachineAllVersions {
    [major: string]: {
        lts: string,
        updates: {
            [full_version: string]: {
                [sapmachine_builds: string]: {
                    release_url: string,
                    ea: string,
                    assets: {
                        [edition: string]: {
                            [arch: string]: {
                                [content_type: string]: {
                                    name: string,
                                    checksum: string,
                                    url: string
                                };
                            };
                        };
                    };
                };
            };
        };
    };
}

export interface ISapMachinelVersions {
    os: string;
    architecture: string;
    jdk_version: string;
    checksum: string;
    download_link: string;
    edition: string;
    image_type: string;
}
