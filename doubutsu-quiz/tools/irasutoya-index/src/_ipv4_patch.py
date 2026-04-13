"""Force IPv4 for all Python socket DNS resolution.

data.commoncrawl.org resolves to IPv6 addresses that are unreachable from the
local network. Python's socket/requests/urllib stacks try each AF_INET6 address
in order and block on each connect until the OS timeout expires, so CDX/WARC
range requests appear to hang. curl avoids this via happy-eyeballs, but
requests does not.

Installing this monkey patch filters out AF_INET6 results from
socket.getaddrinfo, so every subsequent HTTP client in this process sees only
IPv4 addresses and connects immediately.

Import this module from src/main.py before any other import that may touch
the network.
"""

from __future__ import annotations

import socket

_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_only_getaddrinfo(*args, **kwargs):
    results = _orig_getaddrinfo(*args, **kwargs)
    v4 = [r for r in results if r[0] == socket.AF_INET]
    return v4 or results


socket.getaddrinfo = _ipv4_only_getaddrinfo
