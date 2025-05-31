# cross-channel.nvim
This plugin enables cross-posting to Bluesky, Mastodon, and X.com directly from Neovim.

## Required
- Neovim 0.8.0 or higher
- Deno runtime installed
- denops.vim plugin

## Features
- Cross-posting to multiple SNS platforms (Bluesky, Mastodon, X.com)
- Floating window interface for post composition
- Default hashtag support - automatically inserts configured hashtag when opening floating window
- Selective posting to specific SNS platforms
- Authentication management for each platform

## Settings
- let g:crosschannel_bluesky_id = '<Bluesky username>'
- let g:crosschannel_bluesky_password = '<Bluesky password>'
- let g:crosschannel_mastodon_host = '<Mastodon instance host>'
- let g:crosschannel_mastodon_token = '<Mastodon access token>'
- let g:crosschannel_x_consumer_key = '<X.com consumer key>'
- let g:crosschannel_x_consumer_secret = '<X.com consumer secret>'
- let g:crosschannel_x_access_token = '<X.com access token>'
- let g:crosschannel_x_access_token_secret = '<X.com access token secret>'
- let g:hashtag = '<Default hashtag for posts>'

## Commands
- :CrossChannelPost
  - Opens a floating input window for composing a post. If `g:hashtag` is configured, it will be automatically inserted.
- :CrossChannelPostFloating
  - Posts the content of the current floating window to all configured SNS and closes the window.
- :CrossChannelSetup <sns>
  - Performs initial authentication for the specified SNS (bluesky or mastodon).
- :CrossChannelPostSelect <sns1> [<sns2> ...]
  - Opens a floating window with default hashtag (if configured) and binds <CR> to post to the specified SNS.
- :CrossChannelPostSelectExec <sns1> [<sns2> ...]
  - Executes posting to the specified SNS for an existing buffer.

