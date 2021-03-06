import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { debug7zArgs, log, spawn, warn } from "electron-builder-util"
import { copyDir, DO_NOT_USE_HARD_LINKS } from "electron-builder-util/out/fs"
import { chmod, emptyDir } from "fs-extra-p"
import * as path from "path"
import { PlatformPackager } from "../platformPackager"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

function createDownloadOpts(opts: any, platform: string, arch: string, electronVersion: string) {
  if (opts.download != null) {
    warn(`"build.download is deprecated — please use build.electronDownload instead`)
  }

  const downloadOpts = Object.assign({
    cache: opts.cache,
    strictSSL: opts["strict-ssl"]
  }, opts.electronDownload || opts.download)

  subOptionWarning(downloadOpts, "download", "platform", platform)
  subOptionWarning(downloadOpts, "download", "arch", arch)
  subOptionWarning(downloadOpts, "download", "version", electronVersion)
  return downloadOpts
}

function subOptionWarning (properties: any, optionName: any, parameter: any, value: any) {
  if (properties.hasOwnProperty(parameter)) {
    warn(`${optionName}.${parameter} will be inferred from the main options`)
  }
  properties[parameter] = value
}

/** @internal */
export function unpackElectron(packager: PlatformPackager<any>, out: string, platform: string, arch: string, version: string) {
  return unpack(packager, out, platform, createDownloadOpts(packager.config, platform, arch, version))
}

/** @internal */
export function unpackMuon(packager: PlatformPackager<any>, out: string, platform: string, arch: string, version: string) {
  return unpack(packager, out, platform, Object.assign({
    mirror: "https://github.com/brave/muon/releases/download/v",
    customFilename: `brave-v${version}-${platform}-${arch}.zip`,
    verifyChecksum: false,
  }, createDownloadOpts(packager.config, platform, arch, version)))
}

async function unpack(packager: PlatformPackager<any>, out: string, platform: string, options: any) {
  const dist = packager.config.electronDist
  if (dist == null) {
    const zipPath = (await BluebirdPromise.all<any>([
      downloadElectron(options),
      emptyDir(out)
    ]))[0]

    await spawn(path7za, debug7zArgs("x").concat(zipPath, `-o${out}`))
  }
  else {
    const source = packager.getElectronSrcDir(dist)
    const destination = packager.getElectronDestDir(out)
    log(`Copying Electron from "${source}" to "${destination}"`)
    await emptyDir(out)
    await copyDir(source, destination, null, null, DO_NOT_USE_HARD_LINKS)
  }

  if (platform === "linux") {
    // https://github.com/electron-userland/electron-builder/issues/786
    // fix dir permissions — opposite to extract-zip, 7za creates dir with no-access for other users, but dir must be readable for non-root users
    await BluebirdPromise.all([
      chmod(path.join(out, "locales"), "0755"),
      chmod(path.join(out, "resources"), "0755")
    ])
  }
}