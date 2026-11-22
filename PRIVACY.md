# Privacy Policy

Isometric Contributions Plus displays contribution charts and statistics on GitHub profiles.

## Data Collection

The extension reads contribution dates and counts from the GitHub profile you are viewing. It also reads the profile username from the page address. The developer receives none of this information. The extension has no analytics or tracking service.

## Data Usage

To calculate streaks or compare years, the extension may request contribution history from GitHub over HTTPS. The request includes the viewed profile's username and the date range. Choosing **Past year** may also request that profile's calendar and activity from GitHub. The extension calculates statistics and draws the charts in your browser. It may reuse earlier years' contribution counts in memory for the current page.

## Storage

The extension stores your enabled views, line chart measure, contribution color and height scale locally in your browser so your settings persist across visits.

If **Past year** needs to reload the page, the extension saves the destination profile path, the chart's position on screen and a timestamp in the tab's session storage. When the chart loads, the extension removes that entry and uses it to restore your position only if the path matches and the entry is less than 30 seconds old.

## Limited Use

The extension uses this information only to display and navigate GitHub contribution charts, in accordance with the Chrome Web Store User Data Policy and its [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## Contact

If you have questions about this privacy policy, you can open an issue at https://github.com/vycdev/isometric-contributions-plus/issues. Issues are public; do not include private information. For anything private, email vycdev@gmail.com.

Last updated: November 22, 2026
