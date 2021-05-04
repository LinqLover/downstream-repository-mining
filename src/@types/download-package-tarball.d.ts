declare module 'download-package-tarball' {
    import { GotOptions } from 'got'

    type DownloadOptions = {
        url: string
        gotOps?: GotOptions<string | null>
        dir: string
    }

    /** Download a node package as a tarball, for example from github or npm. */
    export default function download(options: DownloadOptions): Promise<void>
}
