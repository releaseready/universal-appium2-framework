export function hasNativeViewHierarchy(source: string): boolean {
  return source.trim().length > 0;
}

class AppPage {
  get nativeViewHierarchy(): Promise<string> {
    return browser.getPageSource();
  }
}

export default new AppPage();
