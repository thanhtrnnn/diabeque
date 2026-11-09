"""Three architectures for the 19 BRFSS survey features: MLP, 1-D CNN and LSTM.

The CNN and LSTM read the features as a sequence of 19 tokens. Token i is x_i * w_i + e_i: the standardised
value scales a learned per-feature vector, plus a learned feature-position embedding. Survey answers have no
natural order, so these two models test whether a convolution or recurrence over feature tokens helps at all.
"""

import torch
from torch import nn

ARCHS = ("mlp", "cnn1d", "lstm")


def build_mlp(n_in: int, n_out: int, dropout: float = 0.15) -> nn.Sequential:
    return nn.Sequential(
        nn.Linear(n_in, 64), nn.ReLU(), nn.Dropout(dropout),
        nn.Linear(64, 32), nn.ReLU(), nn.Dropout(dropout),
        nn.Linear(32, n_out),
    )


class FeatureTokens(nn.Module):
    def __init__(self, n_features: int, dim: int):
        super().__init__()
        self.scale = nn.Parameter(torch.randn(n_features, dim) * 0.1)
        self.position = nn.Parameter(torch.randn(n_features, dim) * 0.1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # (B, F) -> (B, F, D)
        return x.unsqueeze(-1) * self.scale + self.position


class CNN1D(nn.Module):
    def __init__(self, n_in: int, n_out: int, dim: int = 16, channels: int = 32, dropout: float = 0.15):
        super().__init__()
        self.tokens = FeatureTokens(n_in, dim)
        self.conv = nn.Sequential(
            nn.Conv1d(dim, channels, kernel_size=3, padding=1), nn.ReLU(),
            nn.Conv1d(channels, channels, kernel_size=3, padding=1), nn.ReLU(),
        )
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * channels, 32), nn.ReLU(), nn.Linear(32, n_out))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.conv(self.tokens(x).transpose(1, 2))  # (B, C, F)
        return self.head(torch.cat([h.mean(-1), h.amax(-1)], dim=1))


class LSTMNet(nn.Module):
    def __init__(self, n_in: int, n_out: int, dim: int = 16, hidden: int = 32, dropout: float = 0.15):
        super().__init__()
        self.tokens = FeatureTokens(n_in, dim)
        self.lstm = nn.LSTM(dim, hidden, batch_first=True, bidirectional=True)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * hidden, 32), nn.ReLU(), nn.Linear(32, n_out))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, (h, _) = self.lstm(self.tokens(x))  # h: (2, B, H), last state of each direction
        return self.head(torch.cat([h[0], h[1]], dim=1))


def build(arch: str, n_in: int, n_out: int) -> nn.Module:
    if arch == "mlp":
        return build_mlp(n_in, n_out)
    if arch == "cnn1d":
        return CNN1D(n_in, n_out)
    if arch == "lstm":
        return LSTMNet(n_in, n_out)
    raise ValueError(f"unknown arch {arch}")


def n_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
