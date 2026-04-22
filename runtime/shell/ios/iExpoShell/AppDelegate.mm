#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// OTA bundle server URL — change this to your production server
static NSString *const kBundleServerURL = @"http://localhost:3000";

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"iExpoShell";
  self.initialProps = @{};

#if !DEBUG
  // Check for OTA updates in background
  [self checkForOTAUpdate];
#endif

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // 1. Check for OTA downloaded bundle
  NSURL *otaBundle = [self otaBundlePath];
  if (otaBundle && [[NSFileManager defaultManager] fileExistsAtPath:otaBundle.path]) {
    NSLog(@"[iExpo OTA] Loading OTA bundle: %@", otaBundle.path);
    return otaBundle;
  }
  // 2. Fall back to embedded bundle
  NSLog(@"[iExpo OTA] Loading embedded bundle");
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

#pragma mark - OTA Update

- (NSURL *)otaBundlePath
{
  NSString *docs = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  NSString *path = [docs stringByAppendingPathComponent:@"ota/main.jsbundle"];
  return [NSURL fileURLWithPath:path];
}

- (void)checkForOTAUpdate
{
  // Read current local version
  NSString *docs = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  NSString *otaDir = [docs stringByAppendingPathComponent:@"ota"];
  NSString *versionFile = [otaDir stringByAppendingPathComponent:@"version.json"];

  NSUInteger currentVersion = 0;
  if ([[NSFileManager defaultManager] fileExistsAtPath:versionFile]) {
    NSData *data = [NSData dataWithContentsOfFile:versionFile];
    NSDictionary *info = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    currentVersion = [info[@"version"] unsignedIntegerValue];
  }

  // Check server for latest version
  NSString *checkURL = [NSString stringWithFormat:@"%@/check/%lu", kBundleServerURL, (unsigned long)currentVersion];
  NSURL *url = [NSURL URLWithString:checkURL];

  NSLog(@"[iExpo OTA] Checking for update (current: v%lu)...", (unsigned long)currentVersion);

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithURL:url
    completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
      if (error || !data) {
        NSLog(@"[iExpo OTA] Check failed: %@", error.localizedDescription);
        return;
      }

      NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if (![json[@"update_available"] boolValue]) {
        NSLog(@"[iExpo OTA] Already up to date (v%lu)", (unsigned long)currentVersion);
        return;
      }

      NSUInteger newVersion = [json[@"latest"] unsignedIntegerValue];
      NSString *bundleURLStr = [NSString stringWithFormat:@"%@%@", kBundleServerURL, json[@"url"]];
      NSLog(@"[iExpo OTA] Downloading v%lu...", (unsigned long)newVersion);

      // Download new bundle
      NSURL *downloadURL = [NSURL URLWithString:bundleURLStr];
      NSURLSessionDownloadTask *download = [[NSURLSession sharedSession]
        downloadTaskWithURL:downloadURL
        completionHandler:^(NSURL *location, NSURLResponse *resp, NSError *dlError) {
          if (dlError || !location) {
            NSLog(@"[iExpo OTA] Download failed: %@", dlError.localizedDescription);
            return;
          }

          // Save to Documents/ota/
          [[NSFileManager defaultManager] createDirectoryAtPath:otaDir
            withIntermediateDirectories:YES attributes:nil error:nil];

          NSString *destPath = [otaDir stringByAppendingPathComponent:@"main.jsbundle"];
          [[NSFileManager defaultManager] removeItemAtPath:destPath error:nil];
          NSError *moveError;
          [[NSFileManager defaultManager] moveItemAtPath:location.path toPath:destPath error:&moveError];

          if (moveError) {
            NSLog(@"[iExpo OTA] Save failed: %@", moveError.localizedDescription);
            return;
          }

          // Save version info
          NSDictionary *versionInfo = @{
            @"version": @(newVersion),
            @"hash": json[@"hash"] ?: @"",
          };
          NSData *vData = [NSJSONSerialization dataWithJSONObject:versionInfo options:0 error:nil];
          [vData writeToFile:versionFile atomically:YES];

          NSLog(@"[iExpo OTA] ✅ Downloaded v%lu — will load on next app launch", (unsigned long)newVersion);
        }];
      [download resume];
    }];
  [task resume];
}

@end
