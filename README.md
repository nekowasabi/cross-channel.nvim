# cross-channel.nvim
This plugin enables cross-posting to Bluesky, Mastodon, and X.com directly from Neovim.

## Required
- Neovim 0.8.0 or higher
- Deno runtime installed
- denops.vim plugin

## Settings
- let g:crosschannel_bluesky_id = '<Bluesky username>'
- let g:crosschannel_bluesky_password = '<Bluesky password>'
- let g:crosschannel_mastodon_host = '<Mastodon instance host>'
- let g:crosschannel_mastodon_token = '<Mastodon access token>'
- let g:crosschannel_x_consumer_key = '<X.com consumer key>'
- let g:crosschannel_x_consumer_secret = '<X.com consumer secret>'
- let g:crosschannel_x_access_token = '<X.com access token>'
- let g:crosschannel_x_access_token_secret = '<X.com access token secret>'

## Commands
- :CrossChannelPost
  - Opens a floating input window for composing a post.
- :CrossChannelPostFloating
  - Posts the content of the current floating window to all configured SNS and closes the window.
- :CrossChannelSetup <sns>
  - Performs initial authentication for the specified SNS (bluesky or mastodon).
- :CrossChannelPostSelect <sns1> [<sns2> ...]
  - Opens a floating window and binds <CR> to post to the specified SNS.
- :CrossChannelPostSelectExec <sns1> [<sns2> ...]
  - Executes posting to the specified SNS for an existing buffer.
